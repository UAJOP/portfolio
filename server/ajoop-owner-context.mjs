/**
 * AJOOP A4 trusted owner-private context.
 *
 * Shared input-safety expressions for the A4 owner runtime.
 *
 * Owner authority is deliberately not created here. Each owner workflow
 * runtime owns its private authority scope and mints a context only after its
 * injected authenticator succeeds. This module exports no authority brand,
 * mint function, token or verifier.
 */

const codePoint = (value) => String.fromCodePoint(value);
const range = (from, to) => `${codePoint(from)}-${codePoint(to)}`;
const INVISIBLE_AND_BIDI = `${range(0x7f, 0x9f)}${codePoint(0x061c)}${range(0x200b, 0x200f)}${codePoint(0x2028)}${codePoint(0x2029)}${range(0x202a, 0x202e)}${range(0x2060, 0x206f)}${codePoint(0xfeff)}`;

/** Control, bidi and zero-width characters: rejected in identifiers and single-line owner input. */
export const AJOOP_OWNER_UNSAFE_LINE_TEXT = new RegExp(`[${range(0x00, 0x1f)}${INVISIBLE_AND_BIDI}]`, "u");

/** The same set minus tab, line feed and carriage return: rejected in multi-line owner text. */
export const AJOOP_OWNER_UNSAFE_MULTILINE_TEXT = new RegExp(
  `[${range(0x00, 0x08)}${codePoint(0x0b)}${codePoint(0x0c)}${range(0x0e, 0x1f)}${INVISIBLE_AND_BIDI}]`,
  "u",
);

/** Global variant used to neutralize provider display text rather than reject it. */
export const AJOOP_OWNER_UNSAFE_DISPLAY_TEXT = new RegExp(AJOOP_OWNER_UNSAFE_MULTILINE_TEXT.source, "gu");
