/**
 * AJOOP A4 trusted owner-private context.
 *
 * A4.1 decides connector access from `{ surface, authenticatedOwner }`. Those
 * two fields are easy to forge: any JSON body spread into a context object
 * carries them. A4 workflows and actions therefore require a context minted
 * here, in process, by the trusted owner-authentication boundary. A minted
 * context is registered in a module-private WeakSet, so a parsed HTTP body,
 * a copy, a Proxy, or connected-source data can never be mistaken for one.
 *
 * This module has no route, no environment flag and no network. Nothing in
 * the public bridge imports it.
 */
import { AJOOP_READ_CONNECTOR_SURFACES, canUseAjoopReadConnectors } from "./ajoop-read-connector-contract.mjs";

const trustedContexts = new WeakSet();

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

/**
 * Mint the owner-private context. Only the trusted owner-authentication
 * boundary may call this, after it has authenticated the owner itself.
 */
export function createAjoopOwnerPrivateContext() {
  const context = Object.freeze({
    surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE,
    authenticatedOwner: true,
  });
  trustedContexts.add(context);
  return context;
}

/** True only for a context minted above; forged look-alikes, copies and Proxies are false. */
export function isAjoopOwnerPrivateContext(value) {
  try {
    return value !== null && typeof value === "object" && trustedContexts.has(value) && canUseAjoopReadConnectors(value);
  } catch {
    return false;
  }
}
