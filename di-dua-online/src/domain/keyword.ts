/** The keyword matches without accents, spaces or case: "Quẩy", "quay", "QUẨY 🔥" all count. */

export const lettersOnly = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function hasKeyword(comment: string, keyword: string): boolean {
  const k = lettersOnly(keyword);
  return k.length > 0 && lettersOnly(comment).includes(k);
}
