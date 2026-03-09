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

export const EXTENDED_GRAMMAR_CASES = [
  { name: "ext-subject-verb-01", activeText: "The list of items are on the desk.", contextText: "", expectChange: true, expectedText: "The list of items is on the desk." },
  { name: "ext-subject-verb-02", activeText: "Each of the students have a locker.", contextText: "", expectChange: true, expectedText: "Each of the students has a locker." },
  { name: "ext-subject-verb-03", activeText: "Neither the manager nor the assistants was ready.", contextText: "", expectChange: true, expectedText: "Neither the manager nor the assistants were ready." },
  { name: "ext-subject-verb-04", activeText: "The news are surprising.", contextText: "", expectChange: true, expectedText: "The news is surprising." },
  { name: "ext-subject-verb-05", activeText: "There is many reasons to wait.", contextText: "", expectChange: true, expectedText: "There are many reasons to wait." },
  { name: "ext-article-01", activeText: "She adopted an university cat.", contextText: "", expectChange: true, expectedText: "She adopted a university cat." },
  { name: "ext-article-02", activeText: "He gave me a honest answer.", contextText: "", expectChange: true, expectedText: "He gave me an honest answer." },
  { name: "ext-article-03", activeText: "I need a umbrella.", contextText: "", expectChange: true, expectedText: "I need an umbrella." },
  { name: "ext-article-04", activeText: "She wants to buy car.", contextText: "", expectChange: true, expectedText: "She wants to buy a car." },
  { name: "ext-article-05", activeText: "We visited Netherlands last summer.", contextText: "", expectChange: true, expectedText: "We visited the Netherlands last summer." },
  { name: "ext-pronoun-01", activeText: "The girls forgot her tickets.", contextText: "", expectChange: true, expectedText: "The girls forgot their tickets." },
  { name: "ext-pronoun-02", activeText: "When a customer calls, they should state your order number.", contextText: "", expectChange: true, expectedText: "When a customer calls, they should state their order number." },
  { name: "ext-pronoun-03", activeText: "Bob and me are leaving now.", contextText: "", expectChange: true, expectedText: "Bob and I are leaving now." },
  { name: "ext-pronoun-04", activeText: "The gift was for Sarah and I.", contextText: "", expectChange: true, expectedText: "The gift was for Sarah and me." },
  { name: "ext-pronoun-05", activeText: "The dog wagged it's tail.", contextText: "", expectChange: true, expectedText: "The dog wagged its tail." },
  { name: "ext-tense-01", activeText: "Yesterday we walk to the station.", contextText: "", expectChange: true, expectedText: "Yesterday we walked to the station." },
  { name: "ext-tense-02", activeText: "She has finished the report before the meeting started.", contextText: "", expectChange: true, expectedText: "She had finished the report before the meeting started." },
  { name: "ext-tense-03", activeText: "He said he is tired after the trip.", contextText: "", expectChange: true, expectedText: "He said he was tired after the trip." },
  { name: "ext-tense-04", activeText: "By the time we arrived, the movie starts.", contextText: "", expectChange: true },
  { name: "ext-tense-05", activeText: "Last week I go to Chicago and meet my cousin.", contextText: "", expectChange: true, expectedText: "Last week I went to Chicago and met my cousin." },
  { name: "ext-parallel-01", activeText: "She likes hiking, swimming, and to bike.", contextText: "", expectChange: true, expectedText: "She likes hiking, swimming, and biking." },
  { name: "ext-parallel-02", activeText: "The job requires attention to detail, patience, and to work late.", contextText: "", expectChange: true, expectedText: "The job requires attention to detail, patience, and working late." },
  { name: "ext-parallel-03", activeText: "He wanted to clean the garage, to wash the car, and mowing the lawn.", contextText: "", expectChange: true, expectedText: "He wanted to clean the garage, wash the car, and mow the lawn." },
  { name: "ext-parallel-04", activeText: "The coach told us to stretch, drink water, and that we should rest.", contextText: "", expectChange: true, expectedText: "The coach told us to stretch, drink water, and rest." },
  { name: "ext-parallel-05", activeText: "The policy aims to reduce costs, improving safety, and deliver faster.", contextText: "", expectChange: true, expectedText: "The policy aims to reduce costs, improve safety, and deliver faster." },
  { name: "ext-homophone-01", activeText: "Their going to miss the train.", contextText: "", expectChange: true, expectedText: "They're going to miss the train." },
  { name: "ext-homophone-02", activeText: "I would rather stay home then go out.", contextText: "", expectChange: true, expectedText: "I would rather stay home than go out." },
  { name: "ext-homophone-03", activeText: "Its raining, so take a jacket.", contextText: "", expectChange: true, expectedText: "It's raining, so take a jacket." },
  { name: "ext-homophone-04", activeText: "We have less chairs than we need.", contextText: "", expectChange: true, expectedText: "We have fewer chairs than we need." },
  { name: "ext-homophone-05", activeText: "She is taller then her brother.", contextText: "", expectChange: true, expectedText: "She is taller than her brother." },
  { name: "ext-homophone-06", activeText: "Your late again.", contextText: "", expectChange: true, expectedText: "You're late again." },
  { name: "ext-homophone-07", activeText: "I was too tired to go, and he was to.", contextText: "", expectChange: true, expectedText: "I was too tired to go, and he was too." },
  { name: "ext-repeated-01", activeText: "The report report was sent yesterday.", contextText: "", expectChange: true, expectedText: "The report was sent yesterday." },
  { name: "ext-repeated-02", activeText: "I can can finish this tomorrow.", contextText: "", expectChange: true, expectedText: "I can finish this tomorrow." },
  { name: "ext-repeated-03", activeText: "She said that that plan was risky.", contextText: "", expectChange: true, expectedText: "She said that plan was risky." },
  { name: "ext-repeated-04", activeText: "We went to to the store early.", contextText: "", expectChange: true, expectedText: "We went to the store early." },
  { name: "ext-repeated-05", activeText: "He is the the best candidate.", contextText: "", expectChange: true, expectedText: "He is the best candidate." },
  { name: "ext-preposition-01", activeText: "She arrived to the airport early.", contextText: "", expectChange: true, expectedText: "She arrived at the airport early." },
  { name: "ext-preposition-02", activeText: "We discussed about the budget.", contextText: "", expectChange: true, expectedText: "We discussed the budget." },
  { name: "ext-preposition-03", activeText: "He depends in his friends.", contextText: "", expectChange: true, expectedText: "He depends on his friends." },
  { name: "ext-preposition-04", activeText: "I have lived here since three years.", contextText: "", expectChange: true, expectedText: "I have lived here for three years." },
  { name: "ext-preposition-05", activeText: "She is married with a doctor.", contextText: "", expectChange: true, expectedText: "She is married to a doctor." },
  { name: "ext-preposition-06", activeText: "They were waiting on the bus stop.", contextText: "", expectChange: true, expectedText: "They were waiting at the bus stop." },
  { name: "ext-double-negative-01", activeText: "I don't need no help.", contextText: "", expectChange: true, expectedText: "I don't need any help." },
  { name: "ext-double-negative-02", activeText: "She can't hardly hear you.", contextText: "", expectChange: true },
  { name: "ext-double-negative-03", activeText: "We didn't do nothing wrong.", contextText: "", expectChange: true, expectedText: "We didn't do anything wrong." },
  { name: "ext-countability-01", activeText: "There are much problems with the plan.", contextText: "", expectChange: true, expectedText: "There are many problems with the plan." },
  { name: "ext-countability-02", activeText: "I need an advice from you.", contextText: "", expectChange: true },
  { name: "ext-countability-03", activeText: "We have many equipment in storage.", contextText: "", expectChange: true },
  { name: "ext-countability-04", activeText: "She bought fewer bread than usual.", contextText: "", expectChange: true, expectedText: "She bought less bread than usual." }
];

export const ALL_GRAMMAR_CASES = [
  ...BASIC_GRAMMAR_CASES,
  ...HOMOPHONE_GRAMMAR_CASES,
  ...EXTENDED_GRAMMAR_CASES
];

export function getGrammarCaseSet(name = "basic") {
  switch (name) {
    case "basic":
      return BASIC_GRAMMAR_CASES;
    case "homophones":
      return HOMOPHONE_GRAMMAR_CASES;
    case "extended":
      return EXTENDED_GRAMMAR_CASES;
    case "all":
      return ALL_GRAMMAR_CASES;
    default:
      throw new Error(`Unknown --case-set value: ${name}. Use basic, homophones, extended, or all.`);
  }
}
