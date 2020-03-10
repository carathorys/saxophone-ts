import { uniq } from 'lodash';
import { EventType, Saxophone } from './Saxophone';
import { Readable } from 'readable-stream';
import { stripIndent } from 'common-tags';

/**
 * Verify that an XML text is parsed as the specified stream of events.
 *
 * @param xml XML string or array of XML chunks.
 * @param events Sequence of events that must be emitted in order.
 */
const expectEvents = async (xml: string | string[], events: any[]) => {
  return new Promise((r, c) => {
    const handlers: any = {};

    new Promise((resolve, reject) => {
      let eventsIndex = 0;
      const parser = new Saxophone();

      uniq(events.map(([name]) => name)).forEach((eventName: EventType) => {
        handlers[eventName] = (eventArgs: any) => {
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
        };
      });

      handlers['finish'] = () => {
        expect(eventsIndex).toBe(events.length);
        resolve();
      };

      for (const eventName of Object.keys(handlers)) {
        jest.spyOn(handlers, eventName);
        parser.on(eventName as EventType, handlers[eventName]);
      }

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
    })
      .then(() => {
        Object.keys(handlers).forEach(key => {
          expect(handlers[key]).toHaveBeenCalled();
        });
        r();
      })
      .catch(err => {
        c(err);
      });
  });
};

describe('Saxophone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('should parse comments', async () => {
    await expectEvents('<!-- this is a valid comment -->', [
      ['comment', { contents: ' this is a valid comment ' }]
    ]);
  });

  it('should parse comments between two chunks', async () => {
    await expectEvents(
      ['<', '!', '-', '-', ' this is a comment -->'],
      [['comment', { contents: ' this is a comment ' }]]
    );
  });

  it('should not parse unclosed comments', async () => {
    await expectEvents('<!-- this is an invalid comment ->', [
      ['error', Error('Unclosed comment')]
    ]);
  });

  it('should not parse invalid comments', async () => {
    await expectEvents('<!-- this is an -- invalid comment ->', [
      ['error', Error('Unexpected -- inside comment')]
    ]);
  });

  it('should parse CDATA sections', async () => {
    await expectEvents('<![CDATA[this is a c&data s<>ction]]>', [
      ['cdata', { contents: 'this is a c&data s<>ction' }]
    ]);
  });

  it('should parse CDATA sections between two chunks', async () => {
    await expectEvents(
      ['<', '!', '[', 'C', 'D', 'A', 'T', 'A', '[', 'contents]]>'],
      [['cdata', { contents: 'contents' }]]
    );
  });

  it('should not parse invalid CDATA sections', async () => {
    await expectEvents(
      ['<![CDAthis is NOT a c&data s<>ction]]>'],
      [['error', Error('Unrecognized sequence: <![')]]
    );
  });

  it('should not parse unclosed CDATA sections', async () => {
    await expectEvents('<![CDATA[this is a c&data s<>ction]>', [
      ['error', Error('Unclosed CDATA section')]
    ]);
  });

  it('should parse processing instructions', async () => {
    await expectEvents('<?xml version="1.0" encoding="UTF-8" ?>', [
      ['processingInstruction', { contents: 'xml version="1.0" encoding="UTF-8" ' }]
    ]);
  });

  it('should not parse unclosed processing instructions', async () => {
    await expectEvents('<?xml version="1.0" encoding="UTF-8">', [
      ['error', Error('Unclosed processing instruction')]
    ]);
  });

  it('should parse simple tags', async () => {
    await expectEvents('<tag></tag>', [
      ['tagOpen', { name: 'tag', attrs: '', isSelfClosing: false }],
      ['tagClose', { name: 'tag' }]
    ]);
  });

  it('should not parse unclosed opening tags', async () => {
    await expectEvents('<tag', [['error', Error('Unclosed tag')]]);
  });

  it('should not parse unclosed tags 2', async () => {
    await expectEvents('<tag>', [['error', Error('Unclosed tags: tag')]]);
  });

  it('should not parse unclosed tags 3', async () => {
    await expectEvents('<closed><unclosed></closed>', [
      ['tagOpen', { name: 'closed', attrs: '', isSelfClosing: false }],
      ['tagOpen', { name: 'unclosed', attrs: '', isSelfClosing: false }],
      ['error', Error('Unclosed tag: unclosed')]
    ]);
  });

  it('should not parse DOCTYPEs', async () => {
    await expectEvents('<!DOCTYPE html>', [['error', Error('Unrecognized sequence: <!D')]]);
  });

  it('should not parse invalid tags', async () => {
    await expectEvents('< invalid>', [['error', Error('Tag names may not start with whitespace')]]);
  });

  it('should parse self-closing tags', async () => {
    await expectEvents('<test />', [
      ['tagOpen', { name: 'test', attrs: ' ', isSelfClosing: true }]
    ]);
  });

  it('should parse closing tags', async () => {
    await expectEvents('<closed></closed>', [
      ['tagOpen', { name: 'closed', attrs: '', isSelfClosing: false }],
      ['tagClose', { name: 'closed' }]
    ]);
  });

  it('should not parse unclosed closing tags', async () => {
    await expectEvents('</closed', [['error', Error('Unclosed tag')]]);
  });

  it('should parse tags containing attributes', async () => {
    await expectEvents(
      '<tag first="one" second="two"  third="three " /><other attr="value"></other>',
      [
        [
          'tagOpen',
          {
            name: 'tag',
            attrs: ' first="one" second="two"  third="three " ',
            isSelfClosing: true
          }
        ],
        ['tagOpen', { name: 'other', attrs: ' attr="value"', isSelfClosing: false }],
        ['tagClose', { name: 'other' }]
      ]
    );
  });

  it('should parse text nodes', async () => {
    await expectEvents('<textarea> this\nis\na\r\n\ttextual\ncontent  </textarea>', [
      ['tagOpen', { name: 'textarea', attrs: '', isSelfClosing: false }],
      ['text', { contents: ' this\nis\na\r\n\ttextual\ncontent  ' }],
      ['tagClose', { name: 'textarea' }]
    ]);
  });

  it('should parse text nodes outside of the root element', async () => {
    await expectEvents('before<root>inside</root>after', [
      ['text', { contents: 'before' }],
      ['tagOpen', { name: 'root', attrs: '', isSelfClosing: false }],
      ['text', { contents: 'inside' }],
      ['tagClose', { name: 'root' }],
      ['text', { contents: 'after' }]
    ]);
  });

  it('should parse a complete document', async () => {
    await expectEvents(
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
        ['processingInstruction', { contents: 'xml version="1.0" encoding="UTF-8" ' }],
        ['text', { contents: '\n' }],
        ['tagOpen', { name: 'persons', attrs: '', isSelfClosing: false }],
        ['text', { contents: '\n    ' }],
        ['comment', { contents: ' List of persons ' }],
        ['text', { contents: '\n    ' }],
        [
          'tagOpen',
          {
            name: 'person',
            attrs: ' name="Priscilla Z. Holden" address="320-2518 Taciti Street" ',
            isSelfClosing: true
          }
        ],
        ['text', { contents: '\n    ' }],
        [
          'tagOpen',
          {
            name: 'person',
            attrs: ' name="Raymond J. Garner" address="698-806 Dictum Road" ',
            isSelfClosing: true
          }
        ],
        ['text', { contents: '\n    ' }],
        [
          'tagOpen',
          {
            name: 'person',
            attrs: ' name="Alfonso T. Yang" address="3689 Dolor Rd." ',
            isSelfClosing: true
          }
        ],
        ['text', { contents: '\n' }],
        ['tagClose', { name: 'persons' }]
      ]
    );
  });

  it('streaming and full parse should result in the same events', async () => {
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

    ['text', 'cdata', 'comment', 'processingInstruction', 'tagOpen', 'tagClose'].forEach(
      (eventName: EventType) => {
        parser1.on(eventName, async eventArgs => {
          events1.push([eventName, eventArgs]);
        });

        parser2.on(eventName, async eventArgs => {
          events2.push([eventName, eventArgs]);
        });
      }
    );

    // parser1 receives the whole data once
    parser1.parse(xml);

    // parser2 receives the data as several chunks through a piped stream
    const stream = new Readable();

    for (let i = 0; i < xml.length; i += 9) {
      stream.push(xml.slice(i, i + 9));
    }

    stream.push(null);

    parser1.on('finish', async () => {
      finished1 = true;
      if (finished2) {
        expect(events1).toStrictEqual(events2);
        // assert.deepEqual(events1, events2);
        // assert.end();
      }
    });

    parser2.on('finish', async () => {
      finished2 = true;

      if (finished1) {
        expect(events1).toStrictEqual(events2);
        // assert.deepEqual(events1, events2);
        // assert.end();
      }
    });
  });
});
