import { customAlphabet } from "nanoid";

// alfabeto url-safe sem caracteres ambíguos
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SIZE = 21;

const gen = customAlphabet(ALPHABET, SIZE);

export function newPromptId() {
  return gen();
}
