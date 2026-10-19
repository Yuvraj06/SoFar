// Does the question need to SEE the screen? Only then we take a screenshot
// (screenshots cost time and tokens).
const VISUAL =
  /\b(who('s| is| are)\b.*\b(this|that|he|she|they|speaking|talking|on screen)|which (person|guy|man|woman|character|one)|on screen|on the screen|wearing|holding|looks?|looking|what('s| is) (this|that)|where (is|are) (this|they|he|she)|this (person|guy|man|woman|girl|character|place|scene|room)|that (person|guy|man|woman|girl|character|place)|speaking|talking|rn|right now|shown|showing)\b/i;

export function looksVisual(question: string): boolean {
  return VISUAL.test(question);
}
