export const BASIC_GRAMMAR_CASES = [
  {
    name: "fix-simple",
    activeText: "These updates is ready to send.",
    contextText: "",
    expectChange: true,
    expectedText: "These updates are ready to send."
  },
  {
    name: "keep-good",
    activeText: "These updates are ready to send.",
    contextText: "",
    expectChange: false,
    expectedText: "These updates are ready to send."
  },
  {
    name: "fix-short",
    activeText: "This findings are useful.",
    contextText: "",
    expectChange: true
  },
  {
    name: "fix-article-preserve-noun",
    activeText: "that's one step for an seal",
    contextText: "",
    expectChange: true,
    expectedText: "that's one step for a seal"
  },
  {
    name: "keep-unusual-grammatical",
    activeText: "That's one step for a seal.",
    contextText: "",
    expectChange: false,
    expectedText: "That's one step for a seal."
  },
  {
    name: "fix-unusual-grammatical-no-period",
    activeText: "That's one step for a seal",
    contextText: "",
    expectChange: false,
    expectedText: "That's one step for a seal"
  },
  {
    name: "fix-unusual-grammatical-lowercase",
    activeText: "that's one step for a seal.",
    contextText: "",
    expectChange: false,
    expectedText: "that's one step for a seal."
  }
];

export const HOMOPHONE_GRAMMAR_CASES = [
  {
    name: "fix-to-two",
    activeText: "The orange frog can count to too.",
    contextText: "",
    expectChange: true,
    expectedText: "The orange frog can count to two."
  },
  {
    name: "fix-their-there",
    activeText: "Their are two updates in the draft.",
    contextText: "",
    expectChange: true,
    expectedText: "There are two updates in the draft."
  },
  {
    name: "fix-your-youre",
    activeText: "Your welcome to review the notes.",
    contextText: "",
    expectChange: true,
    expectedText: "You're welcome to review the notes."
  },
  {
    name: "fix-its-its",
    activeText: "Its clear that the draft is ready.",
    contextText: "",
    expectChange: true,
    expectedText: "It's clear that the draft is ready."
  },
  {
    name: "keep-good-homophone",
    activeText: "The orange frog can count to two.",
    contextText: "",
    expectChange: false,
    expectedText: "The orange frog can count to two."
  }
];

export const ALL_GRAMMAR_CASES = [
  ...BASIC_GRAMMAR_CASES,
  ...HOMOPHONE_GRAMMAR_CASES
];

export function getGrammarCaseSet(name = "basic") {
  switch (name) {
    case "basic":
      return BASIC_GRAMMAR_CASES;
    case "homophones":
      return HOMOPHONE_GRAMMAR_CASES;
    case "all":
      return ALL_GRAMMAR_CASES;
    default:
      throw new Error(`Unknown --case-set value: ${name}. Use basic, homophones, or all.`);
  }
}
