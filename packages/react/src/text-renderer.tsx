import type { TextSpanView } from "@gotipe/core";
import React from "react";

export interface TextRendererProps {
  spans: TextSpanView[];
}

export function TextRenderer({ spans }: TextRendererProps) {
  return (
    <>
      {spans.map((span, i) => {
        let element: React.ReactNode = span.text;

        for (const mark of span.marks) {
          switch (mark.type) {
            case "bold":
              element = <strong key={`${i}-bold`}>{element}</strong>;
              break;
            case "italic":
              element = <em key={`${i}-italic`}>{element}</em>;
              break;
            case "underline":
              element = <u key={`${i}-underline`}>{element}</u>;
              break;
            case "strikethrough":
              element = <s key={`${i}-strike`}>{element}</s>;
              break;
            case "code":
              element = <code key={`${i}-code`}>{element}</code>;
              break;
            case "link":
              element = (
                <a
                  key={`${i}-link`}
                  href={mark.attrs?.href as string}
                  target={mark.attrs?.target as string}
                  rel="noopener noreferrer"
                >
                  {element}
                </a>
              );
              break;
            case "highlight":
              element = (
                <mark
                  key={`${i}-highlight`}
                  style={{ backgroundColor: (mark.attrs?.color as string) || "yellow" }}
                >
                  {element}
                </mark>
              );
              break;
            case "superscript":
              element = <sup key={`${i}-sup`}>{element}</sup>;
              break;
            case "subscript":
              element = <sub key={`${i}-sub`}>{element}</sub>;
              break;
            case "textColor":
              element = (
                <span
                  key={`${i}-textColor`}
                  style={{ color: (mark.attrs?.color as string) || undefined }}
                >
                  {element}
                </span>
              );
              break;
          }
        }

        return <React.Fragment key={i}>{element}</React.Fragment>;
      })}
    </>
  );
}
