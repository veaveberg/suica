/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attendance from "../attendance.js";
import type * as calendars from "../calendars.js";
import type * as groups from "../groups.js";
import type * as lessons from "../lessons.js";
import type * as migrations_copy_groups_schedules from "../migrations/copy_groups_schedules.js";
import type * as migrations_transfer_user_data from "../migrations/transfer_user_data.js";
import type * as pass_groups from "../pass_groups.js";
import type * as passes from "../passes.js";
import type * as permissions from "../permissions.js";
import type * as ping from "../ping.js";
import type * as schedules from "../schedules.js";
import type * as student_groups from "../student_groups.js";
import type * as students from "../students.js";
import type * as subscriptions from "../subscriptions.js";
import type * as tariffs from "../tariffs.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attendance: typeof attendance;
  calendars: typeof calendars;
  groups: typeof groups;
  lessons: typeof lessons;
  "migrations/copy_groups_schedules": typeof migrations_copy_groups_schedules;
  "migrations/transfer_user_data": typeof migrations_transfer_user_data;
  pass_groups: typeof pass_groups;
  passes: typeof passes;
  permissions: typeof permissions;
  ping: typeof ping;
  schedules: typeof schedules;
  student_groups: typeof student_groups;
  students: typeof students;
  subscriptions: typeof subscriptions;
  tariffs: typeof tariffs;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
