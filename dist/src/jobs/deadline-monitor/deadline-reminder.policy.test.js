import assert from "node:assert/strict";
import test from "node:test";
import { addDaysToDateKey, getNextScheduledReminderPeriod, getReminderBucket, getScheduledReminderPeriods, } from "./deadline-reminder.policy.js";
import { DEADLINE_REMINDER_POLICY_DEFAULTS } from "./deadline-reminder.constants.js";
const monthly = DEADLINE_REMINDER_POLICY_DEFAULTS.AREA_RESPONSIBLE;
const bimonthly = DEADLINE_REMINDER_POLICY_DEFAULTS.PROCESS_OWNER;
test("aplica los límites inclusivos de la ventana mensual", () => {
    const input = {
        cutoffDateKey: "2026-09-15",
        upcomingWindowDays: 30,
    };
    assert.equal(getReminderBucket({ ...input, effectiveDueDateKey: "2026-09-14" }), "OVERDUE");
    assert.equal(getReminderBucket({ ...input, effectiveDueDateKey: "2026-09-15" }), "DUE_TODAY");
    assert.equal(getReminderBucket({ ...input, effectiveDueDateKey: "2026-10-15" }), "UPCOMING");
    assert.equal(getReminderBucket({ ...input, effectiveDueDateKey: "2026-10-16" }), null);
});
test("calcula la ventana de 60 días como fecha calendario", () => {
    assert.equal(addDaysToDateKey("2026-09-15", 60), "2026-11-14");
    assert.equal(getReminderBucket({
        cutoffDateKey: "2026-09-15",
        effectiveDueDateKey: "2026-11-14",
        upcomingWindowDays: 60,
    }), "UPCOMING");
    assert.equal(getReminderBucket({
        cutoffDateKey: "2026-09-15",
        effectiveDueDateKey: "2026-11-15",
        upcomingWindowDays: 60,
    }), null);
});
test("persiste una cadencia mensual y recupera un corte perdido una sola vez", () => {
    const createdAt = new Date("2026-09-01T12:00:00.000Z");
    const first = getScheduledReminderPeriods({
        createdAt,
        now: new Date("2026-09-15T12:00:00.000Z"),
        policy: monthly,
        timeZone: "America/La_Paz",
    });
    assert.deepEqual(first.map((period) => period.periodKey), ["2026-09"]);
    assert.deepEqual(getScheduledReminderPeriods({
        createdAt,
        lastPeriodKey: first[0].periodKey,
        now: new Date("2026-09-16T12:00:00.000Z"),
        policy: monthly,
        timeZone: "America/La_Paz",
    }), []);
    assert.equal(getNextScheduledReminderPeriod({
        createdAt,
        lastPeriodKey: first[0].periodKey,
        now: new Date("2026-10-15T12:00:00.000Z"),
        policy: monthly,
        timeZone: "America/La_Paz",
    })?.periodKey, "2026-10");
    assert.equal(getNextScheduledReminderPeriod({
        createdAt,
        now: new Date("2026-09-16T12:00:00.000Z"),
        policy: monthly,
        timeZone: "America/La_Paz",
    })?.periodKey, "2026-10");
});
test("la cadencia bimestral no depende de paridad de mes", () => {
    const createdAt = new Date("2026-09-01T12:00:00.000Z");
    assert.deepEqual(getScheduledReminderPeriods({
        createdAt,
        now: new Date("2026-09-15T12:00:00.000Z"),
        policy: bimonthly,
        timeZone: "America/La_Paz",
    }).map((period) => period.periodKey), ["2026-09"]);
    assert.deepEqual(getScheduledReminderPeriods({
        createdAt,
        lastPeriodKey: "2026-09",
        now: new Date("2026-10-15T12:00:00.000Z"),
        policy: bimonthly,
        timeZone: "America/La_Paz",
    }), []);
    assert.equal(getScheduledReminderPeriods({
        createdAt,
        lastPeriodKey: "2026-09",
        now: new Date("2026-11-15T12:00:00.000Z"),
        policy: bimonthly,
        timeZone: "America/La_Paz",
    })[0]?.periodKey, "2026-11");
});
//# sourceMappingURL=deadline-reminder.policy.test.js.map