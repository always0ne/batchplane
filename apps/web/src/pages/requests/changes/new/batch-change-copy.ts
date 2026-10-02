export const batchChangeCopy = {
  create: {
    title: "title",
    subtitle: "subtitle",
    review: "review.subtitle",
    submit: "actions.createChange",
  },
  change: {
    title: "titleChange",
    subtitle: "subtitleChange",
    review: "review.subtitleChange",
    submit: "actions.createUpdateChange",
  },
  delete: {
    title: "titleDelete",
    subtitle: "subtitleDelete",
    review: "review.subtitleDelete",
    submit: "actions.createDeleteChange",
  },
} as const;
