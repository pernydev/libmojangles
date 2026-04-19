import type { TestCase } from "./types";
import hudkitText from "../hudkit-prebonk.json";

const testCase: TestCase = {
  name: "hudkit-prebonk",
  text: hudkitText as TestCase["text"],
  resourcePacks: ["hudkit-prebonk.zip"],
  expect: {
    type: "image",
    reference: "hudkit-prebonk.png",
    threshold: 0.2,
  },
};

export default testCase;
