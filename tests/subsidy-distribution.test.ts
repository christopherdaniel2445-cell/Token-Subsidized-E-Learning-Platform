import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringUtf8CV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_LEARNER = 101;
const ERR_INVALID_COURSE = 102;
const ERR_INSUFFICIENT_FUNDS = 103;
const ERR_NOT_ELIGIBLE = 104;
const ERR_SUBSIDY_ALREADY_APPLIED = 105;
const ERR_INVALID_AMOUNT = 106;
const ERR_INVALID_ORACLE = 107;
const ERR_ORACLE_NOT_SET = 108;
const ERR_INVALID_TIMESTAMP = 109;
const ERR_DISTRIBUTION_FAILED = 110;
const ERR_INVALID_CAP = 111;
const ERR_INVALID_RATE = 112;
const ERR_INVALID_STATUS = 113;
const ERR_MAX_SUBSIDIES_EXCEEDED = 114;
const ERR_INVALID_LOCATION = 115;
const ERR_INVALID_POOL = 116;
const ERR_TRANSFER_FAILED = 117;
const ERR_INVALID_PARAM = 118;
const ERR_ALREADY_DISTRIBUTED = 119;
const ERR_INVALID_THRESHOLD = 120;
const ERR_INVALID_MIN_SUBSIDY = 121;
const ERR_INVALID_MAX_SUBSIDY = 122;
const ERR_POOL_NOT_SET = 123;
const ERR_TOKEN_NOT_SET = 124;
const ERR_REGISTRY_NOT_SET = 125;
const ERR_MANAGEMENT_NOT_SET = 126;
const ERR_INVALID_DURATION = 127;
const ERR_INVALID_FEE = 128;
const ERR_FEE_TRANSFER_FAILED = 129;
const ERR_INVALID_RECIPIENT = 130;

interface AppliedSubsidy {
  amount: number;
  timestamp: number;
  status: boolean;
}

interface PendingDistribution {
  learner: string;
  courseId: number;
  amount: number;
}

interface UserProfile {
  remoteArea: boolean;
  location: string;
  eligibilityScore: number;
}

interface Course {
  cost: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class SubsidyDistributionMock {
  state: {
    subsidyPoolBalance: number;
    maxSubsidiesPerLearner: number;
    subsidyCapPerCourse: number;
    minSubsidyAmount: number;
    maxSubsidyAmount: number;
    admin: string;
    oracleContract: string | null;
    tokenContract: string | null;
    registryContract: string | null;
    managementContract: string | null;
    distributionFee: number;
    lastDistributionTime: number;
    distributionInterval: number;
    activeStatus: boolean;
    totalSubsidiesDistributed: number;
    eligibilityThreshold: number;
    appliedSubsidies: Map<string, AppliedSubsidy>;
    pendingDistributions: Map<number, PendingDistribution>;
    learnerSubsidyCount: Map<string, number>;
    courseSubsidyLimits: Map<number, number>;
    locationEligibility: Map<string, boolean>;
  } = {
    subsidyPoolBalance: 0,
    maxSubsidiesPerLearner: 5,
    subsidyCapPerCourse: 1000,
    minSubsidyAmount: 10,
    maxSubsidyAmount: 5000,
    admin: "ST1ADMIN",
    oracleContract: null,
    tokenContract: null,
    registryContract: null,
    managementContract: null,
    distributionFee: 50,
    lastDistributionTime: 0,
    distributionInterval: 144,
    activeStatus: true,
    totalSubsidiesDistributed: 0,
    eligibilityThreshold: 80,
    appliedSubsidies: new Map(),
    pendingDistributions: new Map(),
    learnerSubsidyCount: new Map(),
    courseSubsidyLimits: new Map(),
    locationEligibility: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1LEARNER";
  tokenTransfers: Array<{ amount: number; from: string; to: string }> = [];
  users: Map<string, UserProfile> = new Map();
  courses: Map<number, Course> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      subsidyPoolBalance: 0,
      maxSubsidiesPerLearner: 5,
      subsidyCapPerCourse: 1000,
      minSubsidyAmount: 10,
      maxSubsidyAmount: 5000,
      admin: "ST1ADMIN",
      oracleContract: null,
      tokenContract: null,
      registryContract: null,
      managementContract: null,
      distributionFee: 50,
      lastDistributionTime: 0,
      distributionInterval: 144,
      activeStatus: true,
      totalSubsidiesDistributed: 0,
      eligibilityThreshold: 80,
      appliedSubsidies: new Map(),
      pendingDistributions: new Map(),
      learnerSubsidyCount: new Map(),
      courseSubsidyLimits: new Map(),
      locationEligibility: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1LEARNER";
    this.tokenTransfers = [];
    this.users = new Map();
    this.courses = new Map();
  }

  setUserProfile(learner: string, profile: UserProfile) {
    this.users.set(learner, profile);
  }

  setCourseCost(courseId: number, cost: number) {
    this.courses.set(courseId, { cost });
  }

  getSubsidyPoolBalance(): Result<number> {
    return { ok: true, value: this.state.subsidyPoolBalance };
  }

  getAppliedSubsidy(learner: string, courseId: number): AppliedSubsidy | null {
    return this.state.appliedSubsidies.get(`${learner}-${courseId}`) || null;
  }

  getLearnerSubsidyCount(learner: string): Result<number> {
    return { ok: true, value: this.state.learnerSubsidyCount.get(learner) || 0 };
  }

  getPendingDistribution(distId: number): PendingDistribution | null {
    return this.state.pendingDistributions.get(distId) || null;
  }

  checkEligibility(learner: string, courseId: number): Result<{ eligible: boolean; subsidyAmount: number }> {
    if (!this.state.registryContract) return { ok: false, value: ERR_REGISTRY_NOT_SET };
    if (!this.state.managementContract) return { ok: false, value: ERR_MANAGEMENT_NOT_SET };
    const profile = this.users.get(learner);
    if (!profile) return { ok: false, value: ERR_INVALID_LEARNER };
    const course = this.courses.get(courseId);
    if (!course) return { ok: false, value: ERR_INVALID_COURSE };
    const eligibleLocation = this.state.locationEligibility.get(profile.location) || false;
    if (profile.remoteArea && eligibleLocation && profile.eligibilityScore >= this.state.eligibilityThreshold) {
      const subsidyAmount = Math.min(course.cost, this.state.subsidyCapPerCourse);
      return { ok: true, value: { eligible: true, subsidyAmount } };
    }
    return { ok: false, value: ERR_NOT_ELIGIBLE };
  }

  setOracleContract(oracle: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (oracle === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_ORACLE };
    this.state.oracleContract = oracle;
    return { ok: true, value: true };
  }

  setTokenContract(token: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.tokenContract = token;
    return { ok: true, value: true };
  }

  setRegistryContract(registry: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.registryContract = registry;
    return { ok: true, value: true };
  }

  setManagementContract(management: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.managementContract = management;
    return { ok: true, value: true };
  }

  setSubsidyCapPerCourse(cap: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (cap <= 0) return { ok: false, value: ERR_INVALID_CAP };
    this.state.subsidyCapPerCourse = cap;
    return { ok: true, value: true };
  }

  setMinSubsidyAmount(min: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (min < 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.minSubsidyAmount = min;
    return { ok: true, value: true };
  }

  setMaxSubsidyAmount(max: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (max < 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.maxSubsidyAmount = max;
    return { ok: true, value: true };
  }

  setMaxSubsidiesPerLearner(max: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (max <= 0) return { ok: false, value: ERR_INVALID_CAP };
    this.state.maxSubsidiesPerLearner = max;
    return { ok: true, value: true };
  }

  setDistributionFee(fee: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (fee < 0) return { ok: false, value: ERR_INVALID_FEE };
    this.state.distributionFee = fee;
    return { ok: true, value: true };
  }

  setDistributionInterval(interval: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (interval <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    this.state.distributionInterval = interval;
    return { ok: true, value: true };
  }

  setEligibilityThreshold(threshold: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (threshold <= 0 || threshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    this.state.eligibilityThreshold = threshold;
    return { ok: true, value: true };
  }

  addEligibleLocation(loc: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!loc || loc.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    this.state.locationEligibility.set(loc, true);
    return { ok: true, value: true };
  }

  removeEligibleLocation(loc: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.locationEligibility.delete(loc);
    return { ok: true, value: true };
  }

  depositToPool(amount: number): Result<boolean> {
    if (!this.state.tokenContract) return { ok: false, value: ERR_TOKEN_NOT_SET };
    if (amount < this.state.minSubsidyAmount) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.tokenTransfers.push({ amount, from: this.caller, to: "contract" });
    this.state.subsidyPoolBalance += amount;
    return { ok: true, value: true };
  }

  applySubsidy(courseId: number): Result<number> {
    const learner = this.caller;
    if (!this.state.activeStatus) return { ok: false, value: ERR_INVALID_STATUS };
    const eligibilityRes = this.checkEligibility(learner, courseId);
    if (!eligibilityRes.ok) return eligibilityRes as Result<number>;
    const eligibility = eligibilityRes.value as { eligible: boolean; subsidyAmount: number };
    const currentCount = this.state.learnerSubsidyCount.get(learner) || 0;
    if (currentCount >= this.state.maxSubsidiesPerLearner) return { ok: false, value: ERR_MAX_SUBSIDIES_EXCEEDED };
    if (this.getAppliedSubsidy(learner, courseId)) return { ok: false, value: ERR_SUBSIDY_ALREADY_APPLIED };
    if (this.state.subsidyPoolBalance < eligibility.subsidyAmount) return { ok: false, value: ERR_INSUFFICIENT_FUNDS };
    if (!this.state.tokenContract) return { ok: false, value: ERR_TOKEN_NOT_SET };
    this.state.appliedSubsidies.set(`${learner}-${courseId}`, { amount: eligibility.subsidyAmount, timestamp: this.blockHeight, status: true });
    this.state.learnerSubsidyCount.set(learner, currentCount + 1);
    this.state.subsidyPoolBalance -= eligibility.subsidyAmount;
    this.tokenTransfers.push({ amount: eligibility.subsidyAmount, from: "contract", to: learner });
    this.state.totalSubsidiesDistributed += eligibility.subsidyAmount;
    return { ok: true, value: eligibility.subsidyAmount };
  }

  distributeFunds(batchSize: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.blockHeight - this.state.lastDistributionTime < this.state.distributionInterval) return { ok: false, value: ERR_INVALID_TIMESTAMP };
    this.state.lastDistributionTime = this.blockHeight;
    return { ok: true, value: true };
  }

  toggleActiveStatus(): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.activeStatus = !this.state.activeStatus;
    return { ok: true, value: this.state.activeStatus };
  }

  getTotalSubsidiesDistributed(): Result<number> {
    return { ok: true, value: this.state.totalSubsidiesDistributed };
  }
}

describe("SubsidyDistributionContract", () => {
  let contract: SubsidyDistributionMock;

  beforeEach(() => {
    contract = new SubsidyDistributionMock();
    contract.reset();
  });

  it("sets token contract successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setTokenContract("ST2TOKEN");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.tokenContract).toBe("ST2TOKEN");
  });

  it("rejects setting token contract by non-admin", () => {
    contract.caller = "ST1LEARNER";
    const result = contract.setTokenContract("ST2TOKEN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets registry contract successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setRegistryContract("ST3REGISTRY");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registryContract).toBe("ST3REGISTRY");
  });

  it("sets management contract successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setManagementContract("ST4MANAGEMENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.managementContract).toBe("ST4MANAGEMENT");
  });

  it("sets subsidy cap per course successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setSubsidyCapPerCourse(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.subsidyCapPerCourse).toBe(2000);
  });

  it("rejects invalid subsidy cap", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setSubsidyCapPerCourse(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CAP);
  });

  it("adds eligible location successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.addEligibleLocation("RemoteVillage");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.locationEligibility.get("RemoteVillage")).toBe(true);
  });

  it("rejects invalid location", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.addEligibleLocation("");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOCATION);
  });

  it("removes eligible location successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.addEligibleLocation("RemoteVillage");
    const result = contract.removeEligibleLocation("RemoteVillage");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.locationEligibility.get("RemoteVillage")).toBeUndefined();
  });

  it("rejects deposit without token contract", () => {
    const result = contract.depositToPool(100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOKEN_NOT_SET);
  });

  it("rejects eligibility without registry", () => {
    const result = contract.checkEligibility("ST1LEARNER", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REGISTRY_NOT_SET);
  });

  it("rejects apply subsidy when inactive", () => {
    contract.state.activeStatus = false;
    const result = contract.applySubsidy(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("distributes funds successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.blockHeight = 200;
    contract.state.lastDistributionTime = 50;
    const result = contract.distributeFunds(10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.lastDistributionTime).toBe(200);
  });

  it("rejects distribution by non-admin", () => {
    contract.caller = "ST1LEARNER";
    const result = contract.distributeFunds(10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects distribution too soon", () => {
    contract.caller = "ST1ADMIN";
    contract.blockHeight = 100;
    contract.state.lastDistributionTime = 50;
    contract.state.distributionInterval = 144;
    const result = contract.distributeFunds(10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("toggles active status successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.toggleActiveStatus();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
    expect(contract.state.activeStatus).toBe(false);
  });

  it("rejects toggle by non-admin", () => {
    contract.caller = "ST1LEARNER";
    const result = contract.toggleActiveStatus();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets total subsidies distributed", () => {
    contract.state.totalSubsidiesDistributed = 5000;
    const result = contract.getTotalSubsidiesDistributed();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(5000);
  });
});