import type { Verdict } from "@/lib/types";

export const verdictLabel: Record<Verdict, string> = {
  claimed: "Encontrado",
  available: "Livre",
  unknown: "Inconclusivo",
  waf: "Bloqueado",
  illegal: "Inválido aqui",
};

export const QUOTES: { text: string; from: string }[] = [
  { text: "Quando se elimina o impossível, o que resta, por mais improvável que pareça, deve ser a verdade.", from: "O Signo dos Quatro" },
  { text: "É um erro capital teorizar antes de se ter dados.", from: "Um Escândalo na Boêmia" },
  { text: "Você vê, mas não observa.", from: "Um Escândalo na Boêmia" },
  { text: "O mundo está cheio de coisas óbvias que ninguém, por acaso, jamais observa.", from: "O Cão dos Baskervilles" },
  { text: "Não há nada mais enganoso do que um fato óbvio.", from: "O Mistério do Vale Boscombe" },
  { text: "O jogo começou.", from: "A Aventura da Granja Abbey" },
  { text: "Dados! Dados! Dados! Não posso fazer tijolos sem argila.", from: "As Faias Acobreadas" },
];

export const SEARCH_LINES = [
  "Consultando os arquivos da Scotland Yard…",
  "Seguindo pegadas na névoa digital…",
  "Interrogando servidores em 3 continentes…",
  "Comparando assinaturas de perfil…",
  "Os Irregulares de Baker Street estão nas ruas…",
];
