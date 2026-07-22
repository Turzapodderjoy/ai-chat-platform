import path from "path";

import { loadTxt } from "./txt-loader";
import { loadPdf } from "./pdf-loader";
import { loadDocx } from "./docx-loader";

export class DocumentLoader {

  async load(filepath: string) {

    const extension = path
      .extname(filepath)
      .toLowerCase();

    switch (extension) {

      case ".txt":
        return loadTxt(filepath);

      case ".pdf":
        return loadPdf(filepath);

      case ".docx":
        return loadDocx(filepath);

      default:
        throw new Error(
          `Unsupported file type: ${extension}`
        );

    }

  }

}