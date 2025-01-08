const changeAnalysis = require('./index.js');
const fs = require('fs');

test('Outside Test', () => {
  expect(changeAnalysis.objDeepEquals({}, {})).toBe(true);
});

describe('changeAnalysis', () => {
  test('objDeepEqual', () => {
    expect(changeAnalysis.objDeepEquals({}, {})).toBe(true);
    expect(changeAnalysis.objDeepEquals({ a: 1 }, { a: 1 })).toBe(true);
    expect(changeAnalysis.objDeepEquals({ a: 1 }, { a: 2 })).toBe(false);
    expect(changeAnalysis.objDeepEquals({ a: 'string' }, { a: 'string' })).toBe(
      true
    );
    expect(
      changeAnalysis.objDeepEquals({ a: 'string' }, { a: 'string2' })
    ).toBe(false);
    expect(
      changeAnalysis.objDeepEquals({ a: { foo: 'bar' } }, { a: { foo: 'bar' } })
    ).toBe(true);
    expect(
      changeAnalysis.objDeepEquals({ a: { foo: 'bar' } }, { a: { foo: 'too' } })
    ).toBe(false);
    expect(changeAnalysis.objDeepEquals({ a: [] }, { a: [] })).toBe(true);
    expect(changeAnalysis.objDeepEquals({ a: [] }, { a: [{}] })).toBe(false);
  });

  test('objDeepEqual some real stuff', () => {
    const obj1 = JSON.parse(
      fs.readFileSync('./changeAnalysis/sample/realTestObj1.json')
    );
    const obj2 = JSON.parse(
      fs.readFileSync('./changeAnalysis/sample/realTestObj2.json')
    );
    expect(changeAnalysis.objDeepEquals(obj1, obj2)).toBe(false);
  });

  test('objDeepEqual some real stuff 2', () => {
    const obj1 = JSON.parse(
      `{"type":"CallExpression","start":128,"end":146,"loc":{"start":{"line":4,"column":13},"end":{"line":4,"column":31}},"callee":{"type":"Identifier","start":128,"end":135,"loc":{"start":{"line":4,"column":13},"end":{"line":4,"column":20}},"name":"require"},"arguments":[{"type":"Literal","start":136,"end":145,"loc":{"start":{"line":4,"column":21},"end":{"line":4,"column":30}},"value":"./index","raw":"'./index'"}]}`
    );
    const obj2 = JSON.parse(
      `{"type":"CallExpression","start":126,"end":144,"loc":{"start":{"line":4,"column":13},"end":{"line":4,"column":31}},"callee":{"type":"Identifier","start":126,"end":133,"loc":{"start":{"line":4,"column":13},"end":{"line":4,"column":20}},"name":"require"},"arguments":[{"type":"Literal","start":134,"end":143,"loc":{"start":{"line":4,"column":21},"end":{"line":4,"column":30}},"value":"./index","raw":"'./index'"}]}`
    );
    expect(changeAnalysis.objDeepEquals(obj1, obj2)).toBe(true);
  });
});
