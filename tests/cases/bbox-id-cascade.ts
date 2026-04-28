import type { TestCase } from "./types";

const testCase: TestCase = {
  name: "bbox-id-cascade",
  text: {
    id: "/hud/layout/element[0]/text[0]",
    text: "T",
    extra: [{ text: "e" }, { text: "x" }, { text: "t" }],
  },
  expect: {
    type: "bbox",
    ids: [
      "/hud/layout/element[0]/text[0]",
      "/hud/layout/element[0]/text[0]",
      "/hud/layout/element[0]/text[0]",
      "/hud/layout/element[0]/text[0]",
    ],
  },
};

export default testCase;
