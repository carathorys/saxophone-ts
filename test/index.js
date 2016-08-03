'use strict';

const test = require('tape');
const uniq = require('lodash.uniq');
const tags = require('common-tags');
const Saxophone = require('../dist');

const expectEvents = (assert, xml, events) => {
    let eventsIndex = 0;
    const parser = Saxophone();

    uniq(events.map(([name]) => name)).forEach(eventName => {
        parser.on(eventName, eventArgs => {
            const [expEventName, expEventArgs] = events[eventsIndex];
            eventsIndex++;

            assert.equal(
                eventName, expEventName,
                `should trigger on${expEventName}`
            );

            if (typeof expEventArgs === 'object' && expEventArgs !== null) {
                if (expEventArgs.constructor.name === 'Error') {
                    assert.equal(
                        eventArgs.message, expEventArgs.message,
                        'should emit an error'
                    );
                } else {
                    assert.deepEqual(
                        eventArgs, expEventArgs,
                        'should emit with parsed data'
                    );
                }
            }
        });
    });

    parser.on('end', () => assert.end());
    parser.parse(xml);
};

test('should parse comments', assert => {
    expectEvents(assert,
        '<!-- this is a comment -->',
        [['comment', {contents: ' this is a comment '}]]
    );
});

test('should not parse unclosed comments', assert => {
    expectEvents(assert,
        '<!-- this is a comment ->',
        [['error', new Error('Unclosed comment')]]
    );
});

test('should not parse invalid comments', assert => {
    expectEvents(assert,
        '<!-- this is an -- invalid comment ->',
        [['error', new Error('Unexpected -- inside comment')]]
    );
});

test('should parse CDATA sections', assert => {
    expectEvents(assert,
        '<![CDATA[this is a c&data s<>ction]]>',
        [['cdata', {contents: 'this is a c&data s<>ction'}]]
    );
});

test('should not parse unclosed CDATA sections', assert => {
    expectEvents(assert,
        '<![CDATA[this is a c&data s<>ction]>',
        [['error', new Error('Unclosed CDATA section')]]
    );
});

test('should parse processing instructions', assert => {
    expectEvents(assert,
        '<?xml version="1.0" encoding="UTF-8" ?>',
        [['processinginstruction', {contents: 'xml version="1.0" encoding="UTF-8" '}]]
    );
});

test('should not parse unclosed processing instructions', assert => {
    expectEvents(assert,
        '<?xml version="1.0" encoding="UTF-8">',
        [['error', new Error('Unclosed processing instruction')]]
    );
});

test('should parse simple tags', assert => {
    expectEvents(assert,
        '<tag>',
        [['tagopen', {name: 'tag', attributes: {}, isSelfClosing: false}]]
    );
});

test('should not parse unclosed tags', assert => {
    expectEvents(assert,
        '<tag',
        [['error', new Error('Unclosed tag')]]
    );
});

test('should not parse invalid tags', assert => {
    expectEvents(assert,
        '< invalid>',
        [['error', new Error('Tag names may not start with whitespace')]]
    );
});

test('should parse self-closing tags', assert => {
    expectEvents(assert,
        '<test />',
        [['tagopen', {name: 'test', attributes: {}, isSelfClosing: true}]]
    );
});

test('should parse closing tags', assert => {
    expectEvents(assert,
        '</closed>',
        [['tagclose', {name: 'closed'}]]
    );
});

test('should parse tags with attributes', assert => {
    expectEvents(assert,
        '<tag first="one" second="two"  third="three " /><other attr="value"></other>',
        [
            ['tagopen', {name: 'tag', attributes: {first: 'one', second: 'two', third: 'three '}, isSelfClosing: true}],
            ['tagopen', {name: 'other', attributes: {attr: 'value'}, isSelfClosing: false}],
            ['tagclose', {name: 'other'}]
        ]
    );
});

test('should not parse attributes without a value', assert => {
    expectEvents(assert,
        '<invalid first>',
        [['error', new Error('Expected a value for the attribute')]]
    );
});

test('should not parse invalid attribute names', assert => {
    expectEvents(assert,
        '<invalid this is an attribute="value">',
        [['error', new Error('Attribute names may not contain whitespace')]]
    );
});

test('should not parse unquoted attribute values', assert => {
    expectEvents(assert,
        '<invalid attribute=value value=invalid>',
        [['error', new Error('Attribute values should be quoted')]]
    );
});

test('should not parse misquoted attribute values', assert => {
    expectEvents(assert,
        '<invalid attribute="value\'>',
        [['error', new Error('Unclosed attribute value')]]
    );
});

test('should parse text nodes', assert => {
    expectEvents(assert,
        '<textarea> this\nis\na\r\n\ttextual\ncontent  </textarea>',
        [
            ['tagopen', {name: 'textarea', attributes: {}, isSelfClosing: false}],
            ['text', {contents: ' this\nis\na\r\n\ttextual\ncontent  '}],
            ['tagclose', {name: 'textarea'}]
        ]
    );
});

test('should parse a complete document', assert => {
    expectEvents(assert,
        tags.stripIndent`
            <?xml version="1.0" encoding="UTF-8" ?>
            <persons>
                <!-- List of persons -->
                <person name="Priscilla Z. Holden" address="320-2518 Taciti Street" />
                <person name="Raymond J. Garner" address="698-806 Dictum Road" />
                <person name="Alfonso T. Yang" address="3689 Dolor Rd." />
            </persons>
        `,
        [
            ['processinginstruction', {contents: 'xml version="1.0" encoding="UTF-8" '}],
            ['text', {contents: '\n'}],
            ['tagopen', {name: 'persons', attributes: {}, isSelfClosing: false}],
            ['text', {contents: '\n    '}],
            ['comment', {contents: ' List of persons '}],
            ['text', {contents: '\n    '}],
            ['tagopen', {name: 'person', attributes: {name: 'Priscilla Z. Holden', address: '320-2518 Taciti Street'}, isSelfClosing: true}],
            ['text', {contents: '\n    '}],
            ['tagopen', {name: 'person', attributes: {name: 'Raymond J. Garner', address: '698-806 Dictum Road'}, isSelfClosing: true}],
            ['text', {contents: '\n    '}],
            ['tagopen', {name: 'person', attributes: {name: 'Alfonso T. Yang', address: '3689 Dolor Rd.'}, isSelfClosing: true}],
            ['text', {contents: '\n'}],
            ['tagclose', {name: 'persons'}]
        ]
    );
});