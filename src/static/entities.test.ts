import { parseEntities } from './entities';

describe('entities', () => {
  it('should normalize character entity references', () => {
    expect(parseEntities('&quot;Run!&quot;, he said')).toBe('"Run!", he said');
    expect(parseEntities('&amp; On &amp; On &amp; On')).toBe('& On & On & On');
    expect(parseEntities('J&apos;irai demain')).toBe("J'irai demain");
    expect(parseEntities('&lt;thisIsNotATag&gt;')).toBe('<thisIsNotATag>');
    expect(parseEntities('&lt;&gt;&quot;&amp;&amp;&quot;&apos;&gt;')).toBe('<>"&&"\'>');
  });

  it('should normalize numeric character references', () => {
    expect(parseEntities('&#xA7;')).toBe('§');
    expect(parseEntities('&#167;')).toBe('§');
    expect(parseEntities('&#8258;&#x2612;&#12291;&#x2E3B;')).toBe('⁂☒〃⸻');
  });

  it('should ignore invalid character entity references', () => {
    expect(parseEntities('&unknown;')).toBe('&unknown;');
    expect(parseEntities('&amp')).toBe('&amp');
    expect(parseEntities('&#notanumber;')).toBe('&#notanumber;');
    expect(parseEntities('&#xnotanumber;')).toBe('&#xnotanumber;');
  });
});
