export const integrationSteps = {
  gmail: ["connect", "mail", "test", "done"],
  outlook: ["connect", "mail", "test", "done"],
  mailjet: ["connect", "mail", "test", "done"],
  stripe: ["keys", "pay", "test", "done"],
  qb: ["connect", "map", "sync", "done"],
};
export const integrationStepLabels = {
  connect: "Connect",
  mail: "Defaults",
  test: "Test",
  done: "Done",
  keys: "Keys",
  pay: "Payment links",
  map: "Mapping",
  sync: "First sync",
};
