import { Saxophone } from './Saxophone';
import { stripIndent } from 'common-tags';
import { uniq } from 'lodash';
import { Readable } from 'stream';

/**
 * Verify that an XML text is parsed as the specified stream of events.
 *
 * @param xml XML string or array of XML chunks.
 * @param events Sequence of events that must be emitted in order.
 */
const expectEvents = (xml: string | string[], events: any[]) => {
  let eventsIndex = 0;
  const parser = new Saxophone();

  uniq(events.map(([name]) => name)).forEach((eventName: string) => {
    parser.on(eventName, (eventArgs: { message: any }) => {
      const [expEventName, expEventArgs] = events[eventsIndex];
      eventsIndex++;

      expect(eventName).toBe(expEventName);

      if (typeof expEventArgs === 'object' && expEventArgs !== null) {
        if (expEventArgs.constructor.name === 'Error') {
          expect(eventArgs.message).toBe(expEventArgs.message);
        } else {
          expect(eventArgs).toStrictEqual(expEventArgs);
        }
      }
    });
  });

  parser.on('finish', () => {
    expect(eventsIndex).toBe(events.length);
  });

  if (!Array.isArray(xml)) {
    // By default, split data in chunks of size 10
    const chunks = [];

    for (let i = 0; i < xml.length; i += 10) {
      chunks.push(xml.slice(i, i + 10));
    }

    xml = chunks;
  }

  for (let chunk of xml) {
    parser.write(chunk);
  }

  parser.end();
};
describe('Saxophone', () => {
  it('should parse comments', () => {
    expectEvents('<!-- this is a comment -->', [['comment', { contents: ' this is a comment ' }]]);
  });

  it('should parse comments between two chunks', () => {
    expectEvents(['<', '!', '-', '-', ' this is a comment -->'], [['comment', { contents: ' this is a comment ' }]]);
  });

  it('should not parse unclosed comments', () => {
    expectEvents('<!-- this is a comment ->', [['error', Error('Unclosed comment')]]);
  });

  it('should not parse invalid comments', () => {
    expectEvents('<!-- this is an -- invalid comment ->', [['error', Error('Unexpected -- inside comment')]]);
  });

  it('should parse CDATA sections', () => {
    expectEvents('<![CDATA[this is a c&data s<>ction]]>', [['cdata', { contents: 'this is a c&data s<>ction' }]]);
  });

  it('should parse CDATA sections between two chunks', () => {
    expectEvents(['<', '!', '[', 'C', 'D', 'A', 'T', 'A', '[', 'contents]]>'], [['cdata', { contents: 'contents' }]]);
  });

  it('should not parse invalid CDATA sections', () => {
    expectEvents(['<![CDAthis is NOT a c&data s<>ction]]>'], [['error', Error('Unrecognized sequence: <![')]]);
  });

  it('should not parse unclosed CDATA sections', () => {
    expectEvents('<![CDATA[this is a c&data s<>ction]>', [['error', Error('Unclosed CDATA section')]]);
  });

  it('should parse processing instructions', () => {
    expectEvents('<?xml version="1.0" encoding="UTF-8" ?>', [['processinginstruction', { contents: 'xml version="1.0" encoding="UTF-8" ' }]]);
  });

  it('should not parse unclosed processing instructions', () => {
    expectEvents('<?xml version="1.0" encoding="UTF-8">', [['error', Error('Unclosed processing instruction')]]);
  });

  it('should parse simple tags', () => {
    expectEvents('<tag></tag>', [
      ['tagopen', { name: 'tag', attrs: '', isSelfClosing: false }],
      ['tagclose', { name: 'tag' }]
    ]);
  });

  it('should not parse unclosed opening tags', () => {
    expectEvents('<tag', [['error', Error('Unclosed tag')]]);
  });

  it('should not parse unclosed tags 2', () => {
    expectEvents('<tag>', [['error', Error('Unclosed tags: tag')]]);
  });

  it('should not parse unclosed tags 3', () => {
    expectEvents('<closed><unclosed></closed>', [
      ['tagopen', { name: 'closed', attrs: '', isSelfClosing: false }],
      ['tagopen', { name: 'unclosed', attrs: '', isSelfClosing: false }],
      ['error', Error('Unclosed tag: unclosed')]
    ]);
  });

  it('should not parse DOCTYPEs', () => {
    expectEvents('<!DOCTYPE html>', [['error', Error('Unrecognized sequence: <!D')]]);
  });

  it('should not parse invalid tags', () => {
    expectEvents('< invalid>', [['error', Error('Tag names may not start with whitespace')]]);
  });

  it('should parse self-closing tags', () => {
    expectEvents('<test />', [['tagopen', { name: 'test', attrs: ' ', isSelfClosing: true }]]);
  });

  it('should parse closing tags', () => {
    expectEvents('<closed></closed>', [
      ['tagopen', { name: 'closed', attrs: '', isSelfClosing: false }],
      ['tagclose', { name: 'closed' }]
    ]);
  });

  it('should not parse unclosed closing tags', () => {
    expectEvents('</closed', [['error', Error('Unclosed tag')]]);
  });

  it('should parse tags containing attributes', () => {
    expectEvents('<tag first="one" second="two"  third="three " /><other attr="value"></other>', [
      ['tagopen', { name: 'tag', attrs: ' first="one" second="two"  third="three " ', isSelfClosing: true }],
      ['tagopen', { name: 'other', attrs: ' attr="value"', isSelfClosing: false }],
      ['tagclose', { name: 'other' }]
    ]);
  });

  it('should parse text nodes', () => {
    expectEvents('<textarea> this\nis\na\r\n\ttextual\ncontent  </textarea>', [
      ['tagopen', { name: 'textarea', attrs: '', isSelfClosing: false }],
      ['text', { contents: ' this\nis\na\r\n\ttextual\ncontent  ' }],
      ['tagclose', { name: 'textarea' }]
    ]);
  });

  it('should parse text nodes outside of the root element', () => {
    expectEvents('before<root>inside</root>after', [
      ['text', { contents: 'before' }],
      ['tagopen', { name: 'root', attrs: '', isSelfClosing: false }],
      ['text', { contents: 'inside' }],
      ['tagclose', { name: 'root' }],
      ['text', { contents: 'after' }]
    ]);
  });

  it('should parse a complete document', () => {
    expectEvents(
      stripIndent(`
            <?xml version="1.0" encoding="UTF-8" ?>
            <persons>
                <!-- List of persons -->
                <person name="Priscilla Z. Holden" address="320-2518 Taciti Street" />
                <person name="Raymond J. Garner" address="698-806 Dictum Road" />
                <person name="Alfonso T. Yang" address="3689 Dolor Rd." />
            </persons>
        `),
      [
        ['processinginstruction', { contents: 'xml version="1.0" encoding="UTF-8" ' }],
        ['text', { contents: '\n' }],
        ['tagopen', { name: 'persons', attrs: '', isSelfClosing: false }],
        ['text', { contents: '\n    ' }],
        ['comment', { contents: ' List of persons ' }],
        ['text', { contents: '\n    ' }],
        [
          'tagopen',
          {
            name: 'person',
            attrs: ' name="Priscilla Z. Holden" address="320-2518 Taciti Street" ',
            isSelfClosing: true
          }
        ],
        ['text', { contents: '\n    ' }],
        [
          'tagopen',
          {
            name: 'person',
            attrs: ' name="Raymond J. Garner" address="698-806 Dictum Road" ',
            isSelfClosing: true
          }
        ],
        ['text', { contents: '\n    ' }],
        [
          'tagopen',
          {
            name: 'person',
            attrs: ' name="Alfonso T. Yang" address="3689 Dolor Rd." ',
            isSelfClosing: true
          }
        ],
        ['text', { contents: '\n' }],
        ['tagclose', { name: 'persons' }]
      ]
    );
  });

  it('streaming and full parse should result in the same events', () => {
    const xml = stripIndent(`
        <?xml version="1.0" encoding="UTF-8" ?>
        <persons>
            <!-- List of persons -->
            <person name="Priscilla Z. Holden" address="320-2518 Taciti Street" />
            <person name="Raymond J. Garner" address="698-806 Dictum Road" />
            <person name="Alfonso T. Yang" address="3689 Dolor Rd." />
        </persons>
    `);

    const parser1 = new Saxophone();
    const events1: any[] = [];
    let finished1 = false;

    const parser2 = new Saxophone();
    const events2: any[] = [];
    let finished2 = false;

    ['text', 'cdata', 'comment', 'processinginstruction', 'tagopen', 'tagclose'].forEach(eventName => {
      parser1.on(eventName, eventArgs => {
        events1.push([eventName, eventArgs]);
      });

      parser2.on(eventName, eventArgs => {
        events2.push([eventName, eventArgs]);
      });
    });

    // parser1 receives the whole data once
    parser1.parse(xml);

    // parser2 receives the data as several chunks through a piped stream
    const stream = new Readable();

    stream.pipe(parser2);

    for (let i = 0; i < xml.length; i += 9) {
      stream.push(xml.slice(i, i + 9));
    }

    stream.push(null);

    parser1.on('finish', () => {
      finished1 = true;

      if (finished2) {
        expect(events1).toStrictEqual(events2);
        // assert.deepEqual(events1, events2);
        // assert.end();
      }
    });

    parser2.on('finish', () => {
      finished2 = true;

      if (finished1) {
        expect(events1).toStrictEqual(events2);
        // assert.deepEqual(events1, events2);
        // assert.end();
      }
    });
  });
});
