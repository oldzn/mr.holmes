"use client";

import { forwardRef, useState, type KeyboardEvent } from "react";
import { LensIcon } from "./icons";

const MAX = 10;
const VALID = /^@?[^\s/?#\\]{1,64}$/;

interface Props {
  disabled: boolean;
  onSubmit: (usernames: string[]) => void;
  onError: (message: string) => void;
}

/**
 * Username entry as chips: space, comma or Tab seals a name; Enter seals and
 * investigates; Backspace on an empty field takes the last chip back.
 */
export const SearchConsole = forwardRef<HTMLInputElement, Props>(function SearchConsole({ disabled, onSubmit, onError }, ref) {
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  const seal = (raw: string, current = chips): string[] => {
    const next = [...current];
    for (const token of raw.split(/[\s,]+/)) {
      const name = token.trim().replace(/^@/, "");
      if (!name) continue;
      if (!VALID.test(name)) {
        setHint(`“${name}” não é um nome de usuário válido — sem espaços, barras ou “?”.`);
        continue;
      }
      if (next.some((c) => c.toLowerCase() === name.toLowerCase())) continue;
      if (next.length >= MAX) {
        setHint(`Até ${MAX} suspeitos por caso. Investigue os demais em outro caso.`);
        break;
      }
      next.push(name);
    }
    return next;
  };

  const commit = () => {
    const next = seal(text);
    setChips(next);
    setText("");
    return next;
  };

  const submit = (names = commit()) => {
    if (!names.length) {
      onError("Digite ao menos um nome de usuário para investigar.");
      return;
    }
    setHint(null);
    onSubmit(names);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === " " || e.key === ",") && text.trim()) {
      e.preventDefault();
      commit();
    } else if (e.key === "Tab" && text.trim()) {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !text && chips.length) {
      e.preventDefault();
      setText(chips[chips.length - 1]);
      setChips(chips.slice(0, -1));
    }
  };

  return (
    <>
      <form
        className="console"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        autoComplete="off"
        noValidate
      >
        <label htmlFor="username" className="sr-only">Nomes de usuário a investigar</label>
        <div className="console-field">
          <LensIcon className="lens-ico" />
          {chips.map((c) => (
            <span className="chip" key={c}>
              @{c}
              <button type="button" aria-label={`Remover ${c}`} onClick={() => setChips(chips.filter((x) => x !== c))}>×</button>
            </span>
          ))}
          <input
            id="username"
            ref={ref}
            value={text}
            onChange={(e) => {
              setHint(null);
              const v = e.target.value;
              const parts = v.split(/[\s,]+/);
              if (parts.length > 1) {
                // A paste like "ana bia, caio": seal every whole name, keep the tail editable.
                const tail = /[\s,]$/.test(v) ? "" : (parts.pop() ?? "");
                setChips(seal(parts.join(" ")));
                setText(tail);
              } else setText(v);
            }}
            onKeyDown={onKey}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            placeholder={chips.length ? "Outro suspeito…" : "Digite um nome de usuário…  ex.: johndoe"}
            aria-describedby="console-hint"
          />
          <kbd className="slash" aria-hidden="true">/</kbd>
        </div>
        <button className="cta" type="submit" disabled={disabled}>
          Investigar <span className="k" aria-hidden="true">↵</span>
        </button>
      </form>
      <p id="console-hint" className={`hint${hint ? " err" : ""}`} role={hint ? "alert" : undefined}>
        {hint ?? (
          <>
            Vários suspeitos? Separe com espaço ou vírgula · <code>{"{?}"}</code> testa variações:{" "}
            <code>joao{"{?}"}silva</code> → <code>joao_silva</code> <code>joao-silva</code> <code>joao.silva</code>
          </>
        )}
      </p>
      <div className="try">
        Experimente:
        {["sherlock", "watson", "moriarty"].map((n) => (
          <button key={n} type="button" disabled={disabled} onClick={() => submit(seal(n, []))}>
            @{n}
          </button>
        ))}
      </div>
    </>
  );
});
