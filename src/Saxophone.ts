import { EventListeners, EventType, EventListenerFunctions, EventTypeMap } from './static/events';
import { NodeType, TagOpenNode } from './static/nodes';

export { EventListeners, EventType, EventListenerFunctions, NodeType };

const rStream = require('readable-stream');
const stringDecoder = require('string_decoder');
const Buffer = require('buffer');

/**
 * Parse a XML stream and emit events corresponding
 * to the different tokens encountered.
 *
 * @extends streamWritable
 *
 */
export class Saxophone extends rStream.Writable {
  private _decoder: typeof stringDecoder.StringDecoder;
  private _tagStack: any[];
  private _waiting: { token: any; data: any } | null = null;

  /**
   * Create a new parser instance.
   */
  constructor() {
    super({ decodeStrings: false });
    const state = this._writableState;
    this._decoder = new stringDecoder.StringDecoder(state.defaultEncoding);
    // Stack of tags that were opened up until the current cursor position
    this._tagStack = [];

    // Not waiting initially
    this._waiting = null;
  }

  on<E extends EventType, N extends EventTypeMap<E>>(
    event: E,
    listener: EventListenerFunctions<E, N>
  ): this {
    return super.on(event, listener);
  }

  /**
   * Handle a chunk of data written into the stream.
   *
   * @param {Buffer|string} chunk Chunk of data.
   * @param {string} encoding Encoding of the string, or 'buffer'.
   * @param {function} callback
   */
  private _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
    const data = encoding === 'buffer' ? this._decoder.write(chunk) : chunk;
    let error: any;
    try {
      this._parseChunk(data);
    } catch (err) {
      error = err
    } finally {
      callback(error);
    }
  }

  /**
   * Handle the end of incoming data.
   *
   * @param {function} callback
   */
  private _final(callback: (error?: Error) => void): void {
    try {
      // Make sure all data has been extracted from the decoder
      this._parseChunk(this._decoder.end());
    } catch (err) {
      callback(err);
      return;
    }

    // Handle unclosed nodes
    switch (this._waiting?.token) {
      case 'text':
        // Text nodes are implicitly closed
        this.emit('text', { contents: this._waiting.data });
        break;
      case 'cdata':
        callback(new Error('Unclosed CDATA section'));
        return;
      case 'comment':
        callback(new Error('Unclosed comment'));
        return;
      case 'processingInstruction':
        callback(new Error('Unclosed processing instruction'));
        return;
      case 'tagOpen':
      case 'tagClose':
        // We do not distinguish between unclosed opening
        // or unclosed closing tags
        callback(new Error('Unclosed tag'));
        return;
      default:
      // Pass
    }

    if (this._tagStack.length !== 0) {
      callback(new Error(`Unclosed tags: ${this._tagStack.join(',')}`));
    }
    callback();
  }

  /**
   * Immediately parse a complete chunk of XML and close the stream.
   *
   * @param input Input chunk.
   */
  public parse(input: typeof rStream.Readable | Buffer | string): Saxophone {
    this.write(input);
    this.end();
    return this;
  }

  /**
   * Put the stream into waiting mode, which means we need more data
   * to finish parsing the current token.
   *
   * @private
   * @param token Type of token that is being parsed.
   * @param data Pending data.
   */
  private _wait(token: EventType, data: string) {
    this._waiting = { token, data };
  }

  /**
   * Put the stream out of waiting mode.
   *
   * @private
   * @return Any data that was pending.
   */
  private _unwait() {
    if (this._waiting === null) {
      return '';
    }

    const data = this._waiting.data;
    this._waiting = null;
    return data;
  }

  /**
   * Handle the opening of a tag in the text stream.
   *
   * Push the tag into the opened tag stack and emit the
   * corresponding event on the event emitter.
   *
   * @param {TagOpenNode} node Information about the opened tag.
   */
  private _handleTagOpening(node: TagOpenNode): void {
    if (!node.isSelfClosing) {
      this._tagStack.push(node.name);
    }

    this.emit('tagOpen', node);
  }

  /**
   * Parse a XML chunk.
   *
   * @private
   * @param {string} input A string with the chunk data.
   * an optional error argument.
   */
  private _parseChunk(input: string): void {
    // Use pending data if applicable and get out of waiting mode
    input = this._unwait() + input;

    let chunkPos = 0;
    const end = input.length;

    while (chunkPos < end) {
      if (input[chunkPos] !== '<') {
        const nextTag = input.indexOf('<', chunkPos);

        // We read a TEXT node but there might be some
        // more text data left, so we wait
        if (nextTag === -1) {
          this._wait('text', input.slice(chunkPos));
          break;
        }

        // A tag follows, so we can be confident that
        // we have all the data needed for the TEXT node
        this.emit('text', { contents: input.slice(chunkPos, nextTag) });

        chunkPos = nextTag;
      }

      // Invariant: the cursor now points on the name of a tag,
      // after an opening angled bracket
      chunkPos += 1;
      const nextChar = input[chunkPos];

      // Begin a DOCTYPE, CDATA or comment section
      if (nextChar === '!') {
        chunkPos += 1;
        const nextNextChar = input[chunkPos];

        // Unclosed markup declaration section of unknown type,
        // we need to wait for upcoming data
        // tslint:disable-next-line: strict-type-predicates
        if (typeof nextNextChar === 'undefined') {
          this._wait('markupDeclaration', input.slice(chunkPos - 2));
          break;
        }

        if (
          nextNextChar === '[' &&
          'CDATA['.indexOf(input.slice(chunkPos + 1, chunkPos + 7)) > -1
        ) {
          chunkPos += 7;
          const cdataClose = input.indexOf(']]>', chunkPos);

          // Incomplete CDATA section, we need to wait for
          // upcoming data
          if (cdataClose === -1) {
            this._wait('cdata', input.slice(chunkPos - 9));
            break;
          }

          this.emit('cdata', { contents: input.slice(chunkPos, cdataClose) });

          chunkPos = cdataClose + 3;
          continue;
        }

        const checkNext = input[chunkPos + 1];
        const typeofNextChar = typeof checkNext;

        if (nextNextChar === '-' && (checkNext === '-' || typeofNextChar === 'undefined')) {
          chunkPos += 2;
          const commentClose = input.indexOf('--', chunkPos);

          // Incomplete comment node, we need to wait for
          // upcoming data
          if (commentClose === -1) {
            this._wait('comment', input.slice(chunkPos - 4));
            break;
          }

          if (input[commentClose + 2] !== '>') {
            throw new Error('Unexpected -- inside comment');
          }

          this.emit('comment', { contents: input.slice(chunkPos, commentClose) });

          chunkPos = commentClose + 3;
          continue;
        }

        // TODO: recognize DOCTYPEs here
        throw new Error('Unrecognized sequence: <!' + nextNextChar);
      }

      if (nextChar === '?') {
        chunkPos += 1;
        const piClose = input.indexOf('?>', chunkPos);

        // Unclosed processing instruction, we need to
        // wait for upcoming data
        if (piClose === -1) {
          this._wait('processingInstruction', input.slice(chunkPos - 2));
          break;
        }

        this.emit('processingInstruction', { contents: input.slice(chunkPos, piClose) });

        chunkPos = piClose + 2;
        continue;
      }

      // Recognize regular tags (< ... >)
      const tagClose = input.indexOf('>', chunkPos);

      if (tagClose === -1) {
        this._wait('tagOpen', input.slice(chunkPos - 1));
        break;
      }

      // Check if the tag is a closing tag
      if (input[chunkPos] === '/') {
        const tagName = input.slice(chunkPos + 1, tagClose);
        const stackedTagName = this._tagStack.pop();

        if (stackedTagName !== tagName) {
          this._tagStack.length = 0;
          throw new Error(`Unclosed tag: ${stackedTagName}`);
        }

        this.emit('tagClose', { name: tagName });

        chunkPos = tagClose + 1;
        continue;
      }

      // Check if the tag is self-closing
      const isSelfClosing = input[tagClose - 1] === '/';
      let realTagClose = isSelfClosing ? tagClose - 1 : tagClose;

      // Extract the tag name and attributes
      const whitespace = input.slice(chunkPos).search(/\s/);

      if (whitespace === -1 || whitespace >= tagClose - chunkPos) {
        // Tag without any attribute
        this._handleTagOpening({
          name: input.slice(chunkPos, realTagClose),
          attrs: '',
          isSelfClosing
        });
      } else if (whitespace === 0) {
        throw new Error('Tag names may not start with whitespace');
      } else {
        // Tag with attributes
        this._handleTagOpening({
          name: input.slice(chunkPos, chunkPos + whitespace),
          attrs: input.slice(chunkPos + whitespace, realTagClose),
          isSelfClosing
        });
      }

      chunkPos = tagClose + 1;
    }
  }
}
