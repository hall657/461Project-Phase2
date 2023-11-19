module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageReporters: ["json", "text", "lcov", "clover"],
  coverageDirectory: "coverage",
  collectCoverageFrom: ["rate/metric.ts", "rate/new-metrics.ts", "rate/analyze.ts"]
};
