import { parseAttrs } from './attrs';

describe('attribute parser', () => {
  it('should parse tag attributes', () => {
    expect(parseAttrs(' first="one" second="two"  third="three " ')).toStrictEqual({
      first: 'one',
      second: 'two',
      third: 'three '
    });
  });

  it('should not parse attributes without a value', () => {
    expect(parseAttrs.bind(null, ' first')).toThrowError('Expected a value for the attribute');
  });

  it('should not parse invalid attribute names', () => {
    expect(parseAttrs.bind(null, ' this is an attribute="value"')).toThrowError('Attribute names may not contain whitespace');
  });

  it('should not parse unquoted attribute values', () => {
    expect(parseAttrs.bind(null, ' attribute=value value=invalid')).toThrowError('Attribute values should be quoted');
  });

  it('should not parse misquoted attribute values', () => {
    expect(parseAttrs.bind(null, ' attribute="value\'')).toThrowError('Unclosed attribute value');
  });
});
