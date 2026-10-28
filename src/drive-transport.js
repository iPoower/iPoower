/* Transport opaque Control Vault. Reproduction : tools/vendor-vault-drive.js.
 * Aucun code, clé ou déchiffrement. Sources SHA-256 :
{
 "src/services/opaque-drive.ts": "714febdca7731a19a46d38686025d95c5e1d2f707552e23428c0442dad17bb29",
 "src/core/race-packet.ts": "a9ae071b8e1b6372b2ab3f59005bf92f0a17d2e7fe1e2cc48dae4f4c49154516",
 "src/core/sync-revision.ts": "c7e2414d7d803380407e4e3f38c8d229580eebdea0ba36f8ab2e602cb79ea92d",
 "src/core/crypto.ts": "1f9f7b1e6152d22fca7ac4162ad407539e353f2c8de6d00d521d6f7ccd5a46a8"
}
 */
var DriveTransport = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../cv-direct/drive-entry.ts
  var drive_entry_exports = {};
  __export(drive_entry_exports, {
    OpaqueDrive: () => OpaqueDrive,
    readRacePacket: () => readRacePacket
  });

  // ../cv-direct/src/core/crypto.ts
  var MAGIC = new Uint8Array([67, 86, 76, 84]);
  var SALT_LEN = 16;
  var IV_LEN = 12;
  var HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN;
  var subtle = () => globalThis.crypto.subtle;
  var enc = new TextEncoder();
  var dec = new TextDecoder("utf-8", { fatal: true });
  function toHex(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
  }
  async function sha256(data) {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    return toHex(await subtle().digest("SHA-256", bytes));
  }

  // ../cv-direct/src/core/race-packet.ts
  var PACKET_LIMITS = Object.freeze({ file: 71303168, cipher: 50331648, depth: 4 });
  var PacketError = class extends Error {
    constructor(code) {
      super(code);
      this.code = code;
      this.name = "PacketError";
    }
    code;
  };
  var fail = (code) => {
    throw new PacketError(code);
  };
  var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var fields = (v, wanted) => Object.keys(v).length === wanted.length && wanted.every((k) => Object.hasOwn(v, k));
  function strictJson(bytes) {
    if (bytes.byteLength > PACKET_LIMITS.file) return fail("FILE_TOO_LARGE");
    if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) return fail("MALFORMED_FILE");
    let text, parsed;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      parsed = JSON.parse(text);
    } catch {
      return fail("MALFORMED_FILE");
    }
    const frames = [];
    let at = 0;
    while (at < text.length) {
      const c = text[at];
      if (c === '"') {
        const begin = at++;
        while (text[at] !== '"' && at < text.length) at += text[at] === "\\" ? 2 : 1;
        at++;
        let next = at;
        while (/[\t\n\r ]/.test(text[next] ?? "") && next < text.length) next++;
        if (text[next] === ":") {
          const frame = frames.at(-1), key = JSON.parse(text.slice(begin, at));
          if (!frame || frame.has(key)) return fail("MALFORMED_FILE");
          frame.add(key);
        }
      } else {
        if (c === "{" || c === "[") {
          frames.push(c === "{" ? /* @__PURE__ */ new Set() : null);
          if (frames.length > PACKET_LIMITS.depth) return fail("MALFORMED_FILE");
        } else if (c === "}" || c === "]") frames.pop();
        at++;
      }
    }
    const numbers = (v) => {
      if (typeof v === "number" && !Number.isFinite(v)) return fail("MALFORMED_FILE");
      if (v && typeof v === "object") Object.values(v).forEach(numbers);
    };
    numbers(parsed);
    return parsed;
  }
  function base64(value, min, max) {
    if (typeof value !== "string" || !value.length || value.length % 4 || value.length > 4 * Math.ceil(max / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return fail("INVALID_ENCODING");
    let raw;
    try {
      raw = atob(value);
      if (btoa(raw) !== value) return fail("INVALID_ENCODING");
    } catch {
      return fail("INVALID_ENCODING");
    }
    if (raw.length < min || raw.length > max) return fail("INVALID_ENCODING");
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  var Packet = class {
    constructor(bytes, info) {
      this.info = info;
      this.#bytes = bytes;
      Object.freeze(info);
      Object.freeze(this);
    }
    info;
    #bytes;
    copyBytes() {
      return this.#bytes.slice();
    }
  };
  async function readRacePacket(input, referenceHash) {
    if (input.byteLength > PACKET_LIMITS.file) return fail("FILE_TOO_LARGE");
    const bytes = input.slice(), v = strictJson(bytes);
    if (object(v) && !Object.hasOwn(v, "format") && v.app === "twrc-backup") return fail("LEGACY_REEXPORT_REQUIRED");
    if (!object(v) || v.format !== "race-control-backup") return fail("UNSUPPORTED_FORMAT");
    if (v.schemaVersion !== 1) return fail("UNSUPPORTED_SCHEMA");
    if (!fields(v, ["format", "schemaVersion", "createdAt", "appVersion", "sha256", "payload"]) || typeof v.createdAt !== "string" || v.createdAt.length !== 24 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString() !== v.createdAt || typeof v.appVersion !== "string" || v.appVersion.trim() !== v.appVersion || !/^prod-[1-9][0-9]{0,8}$/.test(v.appVersion) || typeof v.sha256 !== "string" || v.sha256.length !== 64 || !/^[0-9a-f]{64}$/.test(v.sha256) || !object(v.payload)) return fail("INVALID_ENVELOPE");
    const p = v.payload;
    if (!fields(p, ["alg", "kdf", "it", "s", "i", "c"]) || p.alg !== "AES-256-GCM" || p.kdf !== "PBKDF2-SHA256" || p.it !== 6e5)
      return fail("INVALID_ENVELOPE");
    base64(p.s, 16, 16);
    base64(p.i, 12, 12);
    const cipher = base64(p.c, 16, PACKET_LIMITS.cipher);
    if (await sha256(cipher) !== v.sha256) return fail("INTEGRITY_MISMATCH");
    const fileHash = await sha256(bytes);
    if (referenceHash !== void 0 && (!/^[0-9a-f]{64}$/.test(referenceHash) || fileHash !== referenceHash)) return fail("INTEGRITY_MISMATCH");
    return new Packet(bytes, {
      format: "race-control-backup",
      schemaVersion: 1,
      createdAt: v.createdAt,
      appVersion: v.appVersion,
      cipherSha256: v.sha256,
      fileSha256: fileHash,
      size: bytes.length
    });
  }

  // ../cv-direct/src/core/sync-revision.ts
  var invalid = () => {
    throw new Error("INVALID_REVISION");
  };
  var object2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var identifier = (v) => typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
  function readSyncRevision(value) {
    if (!object2(value) || Object.keys(value).length !== 4 || !["id", "parents", "device", "seq"].every((k) => Object.hasOwn(value, k)) || !identifier(value.id) || !identifier(value.device) || typeof value.seq !== "number" || !Number.isSafeInteger(value.seq) || value.seq < 1 || !Array.isArray(value.parents) || value.parents.length > 8)
      return invalid();
    const parents = [];
    for (const p of value.parents) {
      if (!identifier(p) || p === value.id || parents.length > 0 && parents[parents.length - 1] >= p) return invalid();
      parents.push(p);
    }
    return Object.freeze({ id: value.id, parents: Object.freeze(parents), device: value.device, seq: value.seq });
  }
  function syncRevisionProperties(value) {
    const rev = readSyncRevision(value), p = { rcr: rev.id, rcd: rev.device, rcs: String(rev.seq) };
    for (let i = 0; i * 3 < rev.parents.length; i++) p["rcp" + i] = rev.parents.slice(i * 3, i * 3 + 3).join(",");
    return Object.freeze(p);
  }
  function syncRevisionFromProperties(value) {
    if (!object2(value)) return invalid();
    const keys = Object.keys(value).filter((k) => k.startsWith("rc"));
    if (!keys.length) return void 0;
    for (const k of keys) {
      const v = value[k];
      if (!/^(rcr|rcd|rcs|rcp[0-2])$/.test(k) || typeof v !== "string" || v.length > 124 || new TextEncoder().encode(k + v).length > 124) return invalid();
    }
    if (typeof value.rcs !== "string" || !/^[1-9][0-9]{0,15}$/.test(value.rcs)) return invalid();
    const parents = [];
    for (let i = 0; i < 3; i++) {
      const group = value["rcp" + i];
      if (typeof group === "string") parents.push(...group.split(","));
    }
    const revision = readSyncRevision({ id: value.rcr, parents, device: value.rcd, seq: Number(value.rcs) });
    const canonical = syncRevisionProperties(revision);
    if (keys.length !== Object.keys(canonical).length || keys.some((k) => value[k] !== canonical[k])) return invalid();
    return revision;
  }
  function sameSyncRevision(a, b) {
    return a === void 0 || b === void 0 ? a === b : a.id === b.id && a.device === b.device && a.seq === b.seq && a.parents.join(",") === b.parents.join(",");
  }

  // ../cv-direct/src/services/opaque-drive.ts
  var DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  var API = "https://www.googleapis.com/drive/v3";
  var UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  var OpaqueDriveError = class extends Error {
    constructor(code) {
      super(code);
      this.code = code;
      this.name = "OpaqueDriveError";
    }
    code;
  };
  var fail2 = (code) => {
    throw new OpaqueDriveError(code);
  };
  var id = (value) => value.trim() === value && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : fail2("conflict");
  var hash = (value) => typeof value === "string" && value.length === 64 && /^[0-9a-f]+$/.test(value);
  var object3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var OpaqueDrive = class {
    constructor(origins, fetcher = fetch, now = () => Date.now()) {
      this.origins = origins;
      this.fetcher = fetcher;
      this.now = now;
      this.guard();
    }
    origins;
    fetcher;
    now;
    #token = null;
    #until = 0;
    #epoch = 0;
    guard() {
      if (typeof location === "undefined") return fail2("origin");
      const u = new URL(location.origin);
      if (u.protocol !== "https:" || u.hostname === "github.io" || u.hostname.endsWith(".github.io") || !this.origins.includes(u.origin)) return fail2("origin");
    }
    connect(token, expiresIn, granted) {
      this.guard();
      this.disconnect();
      if (token.length > 8192 || token.trim() !== token || !/^[A-Za-z0-9._~+\/-]{1,8192}=*$/.test(token) || !Number.isFinite(expiresIn) || expiresIn <= 30 || expiresIn > 3600 || granted.length !== 1 || granted[0] !== DRIVE_FILE_SCOPE) return fail2("auth");
      this.#token = token;
      this.#until = this.now() + expiresIn * 1e3 - 3e4;
    }
    disconnect() {
      this.#token = null;
      this.#until = 0;
      this.#epoch++;
    }
    get connected() {
      if (!this.#token || this.now() >= this.#until) {
        this.disconnect();
        return false;
      }
      return true;
    }
    lease() {
      this.guard();
      if (!this.#token || this.now() >= this.#until) {
        this.disconnect();
        return fail2("auth");
      }
      return this.#epoch;
    }
    check(epoch, signal) {
      if (signal?.aborted) return fail2("cancelled");
      if (this.lease() !== epoch) return fail2("auth");
    }
    async request(url, init, epoch, allowed = []) {
      this.check(epoch, init.signal);
      let r;
      const controller = new AbortController(), abort = () => controller.abort();
      if (init.signal?.aborted) abort();
      init.signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 3e4);
      const fetcher = this.fetcher;
      try {
        r = await fetcher(url, {
          ...init,
          signal: controller.signal,
          redirect: "error",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: { ...init.headers, Authorization: "Bearer " + this.#token }
        });
      } catch {
        return fail2(init.signal?.aborted ? "cancelled" : "unavailable");
      } finally {
        clearTimeout(timer);
        init.signal?.removeEventListener("abort", abort);
      }
      this.check(epoch, init.signal);
      if (r.ok || allowed.includes(r.status)) return r;
      if (r.status === 401) {
        this.disconnect();
        return fail2("auth");
      }
      if (r.status === 404) return fail2("missing");
      if (r.status === 409) return fail2("conflict");
      if (r.status === 403) {
        let quota = false;
        try {
          const e = await this.json(r, init.signal ?? void 0);
          quota = JSON.stringify(e).includes("storageQuotaExceeded");
        } catch {
        }
        if (quota) return fail2("quota");
      }
      return fail2("unavailable");
    }
    async bytes(r, max, signal) {
      const announced = r.headers.get("Content-Length");
      if (announced !== null && (!/^\d+$/.test(announced) || Number(announced) > max)) {
        void r.body?.cancel().catch(() => {
        });
        return fail2("integrity");
      }
      const reader = r.body?.getReader();
      if (!reader) return fail2("incomplete");
      const chunks = [];
      let size = 0;
      try {
        for (; ; ) {
          let timer;
          let abort;
          const part = await Promise.race([reader.read(), new Promise((_, reject) => {
            const stop = (code) => {
              reject(new OpaqueDriveError(code));
              void reader.cancel().catch(() => {
              });
            };
            abort = () => stop("cancelled");
            if (signal?.aborted) {
              abort();
              return;
            }
            signal?.addEventListener("abort", abort, { once: true });
            timer = setTimeout(() => stop("unavailable"), 3e4);
          })]).finally(() => {
            clearTimeout(timer);
            if (abort) signal?.removeEventListener("abort", abort);
          });
          if (part.done) break;
          size += part.value.length;
          if (size > max) {
            void reader.cancel().catch(() => {
            });
            return fail2("integrity");
          }
          chunks.push(part.value);
        }
      } catch (e) {
        if (e instanceof OpaqueDriveError) throw e;
        return fail2("unavailable");
      }
      if (signal?.aborted) return fail2("cancelled");
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      return bytes;
    }
    async json(r, signal) {
      try {
        const v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await this.bytes(r, 1024 * 1024, signal)));
        if (!object3(v)) return fail2("incomplete");
        return v;
      } catch (e) {
        if (e instanceof OpaqueDriveError) throw e;
        return fail2("incomplete");
      }
    }
    async reserveId(signal) {
      const epoch = this.lease(), v = await this.json(await this.request(API + "/files/generateIds?count=1&space=drive&type=files", { signal }, epoch), signal);
      this.check(epoch, signal);
      if (!Array.isArray(v.ids) || v.ids.length !== 1 || typeof v.ids[0] !== "string") return fail2("incomplete");
      return id(v.ids[0]);
    }
    async account(signal) {
      const epoch = this.lease();
      const value = await this.json(await this.request(API + "/about?fields=user(permissionId)", { signal }, epoch), signal);
      this.check(epoch, signal);
      if (!object3(value.user) || typeof value.user.permissionId !== "string") return fail2("incomplete");
      return id(value.user.permissionId);
    }
    async identity(signal) {
      const epoch = this.lease();
      const value = await this.json(await this.request(API + "/about?fields=user(permissionId,emailAddress)", { signal }, epoch), signal);
      this.check(epoch, signal);
      if (!object3(value.user) || typeof value.user.permissionId !== "string" || typeof value.user.emailAddress !== "string" || value.user.emailAddress.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(value.user.emailAddress)) return fail2("incomplete");
      return Object.freeze({ id: id(value.user.permissionId), label: value.user.emailAddress });
    }
    async folder(folder, signal) {
      id(folder);
      const epoch = this.lease();
      const p = await this.json(await this.request(API + "/files/" + folder + "?fields=id,mimeType,trashed,ownedByMe,appProperties,capabilities(canAddChildren)", { signal }, epoch), signal);
      this.check(epoch, signal);
      if (p.id !== folder || p.trashed !== false || p.ownedByMe !== true || p.mimeType !== "application/vnd.google-apps.folder" || !object3(p.appProperties) || p.appProperties.cv_contract !== "rc-folder-v1" || !object3(p.capabilities) || p.capabilities.canAddChildren !== true) return fail2("conflict");
    }
    // Only folders already visible to this OAuth application and bearing its
    // private contract. This never grants access to an arbitrary Drive folder.
    async folders(signal) {
      const epoch = this.lease(), out = [], pages = /* @__PURE__ */ new Set(), ids = /* @__PURE__ */ new Set();
      let next = "", count = 0;
      do {
        if (++count > 10) return fail2("incomplete");
        const params = new URLSearchParams({
          q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners and appProperties has { key='cv_contract' and value='rc-folder-v1' }",
          spaces: "drive",
          pageSize: "100",
          fields: "nextPageToken,incompleteSearch,files(id,name,createdTime,mimeType,trashed,ownedByMe,appProperties,capabilities(canAddChildren))"
        });
        if (next) params.set("pageToken", next);
        const page = await this.json(await this.request(API + "/files?" + params, { signal }, epoch), signal);
        this.check(epoch, signal);
        if (page.incompleteSearch !== false || !Array.isArray(page.files) || page.files.length > 100) return fail2("incomplete");
        for (const f of page.files) {
          if (!object3(f) || typeof f.id !== "string" || typeof f.name !== "string" || !f.name || f.name.length > 1024 || typeof f.createdTime !== "string" || f.createdTime.length > 40 || !Number.isFinite(Date.parse(f.createdTime)) || f.mimeType !== "application/vnd.google-apps.folder" || f.trashed !== false || f.ownedByMe !== true || !object3(f.appProperties) || f.appProperties.cv_contract !== "rc-folder-v1" || !object3(f.capabilities) || f.capabilities.canAddChildren !== true) return fail2("conflict");
          const folder = id(f.id);
          if (ids.has(folder) || out.length >= 1e3) return fail2("incomplete");
          ids.add(folder);
          out.push(Object.freeze({ id: folder, name: f.name, createdTime: f.createdTime }));
        }
        if (page.nextPageToken === void 0) next = "";
        else if (typeof page.nextPageToken !== "string" || !page.nextPageToken || page.nextPageToken.length > 4096 || pages.has(page.nextPageToken)) return fail2("incomplete");
        else {
          next = page.nextPageToken;
          pages.add(next);
        }
      } while (next);
      this.check(epoch, signal);
      return out.sort((a, b) => b.createdTime.localeCompare(a.createdTime) || a.id.localeCompare(b.id));
    }
    async createFolder(fileId, signal) {
      id(fileId);
      const epoch = this.lease();
      try {
        await this.folder(fileId, signal);
        this.check(epoch, signal);
        return fileId;
      } catch (e) {
        if (!(e instanceof OpaqueDriveError) || e.code !== "missing") throw e;
      }
      const metadata = {
        id: fileId,
        name: "Control Vault \u2014 sauvegardes chiffr\xE9es",
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { cv_contract: "rc-folder-v1" }
      };
      await this.request(API + "/files?fields=id", { method: "POST", signal, headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(metadata) }, epoch, [409]);
      await this.folder(fileId, signal);
      this.check(epoch, signal);
      return fileId;
    }
    // Descripteur A1 public : jamais un code, une clé ou un profil métier. Son
    // contrôle GCM et sa dérivation restent exclusivement dans Race Control.
    profileBytes(bytes) {
      if (!(bytes instanceof Uint8Array) || bytes.length > 2048) return fail2("integrity");
      let p;
      try {
        p = strictJson(bytes);
      } catch {
        return fail2("integrity");
      }
      const keys = ["format", "schemaVersion", "keyId", "createdAt", "kdf", "it", "s", "check"];
      const base642 = (value, size) => {
        try {
          if (typeof value !== "string") return false;
          const raw = atob(value);
          return raw.length === size && btoa(raw) === value;
        } catch {
          return false;
        }
      };
      if (!object3(p) || Object.keys(p).length !== keys.length || keys.some((k) => !(k in p)) || p.format !== "race-control-sync-key" || p.schemaVersion !== 1 || typeof p.keyId !== "string" || !/^[0-9a-f]{32}$/.test(p.keyId) || p.kdf !== "PBKDF2-SHA256" || p.it !== 6e5 || typeof p.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.createdAt) || !Number.isFinite(Date.parse(p.createdAt)) || new Date(p.createdAt).toISOString() !== p.createdAt || !base642(p.s, 16) || !object3(p.check) || Object.keys(p.check).sort().join() !== "c,i" || !base642(p.check.i, 12) || !base642(p.check.c, 46)) return fail2("integrity");
    }
    async profiles(folder, signal) {
      id(folder);
      const epoch = this.lease();
      await this.folder(folder, signal);
      this.check(epoch, signal);
      const out = [], seen = /* @__PURE__ */ new Set();
      let next = "";
      do {
        const params = new URLSearchParams({
          q: `'${folder}' in parents and trashed = false and appProperties has { key='cv_contract' and value='rc-key-a1' }`,
          pageSize: "1000",
          fields: "nextPageToken,incompleteSearch,files(id,size,trashed,parents,appProperties)"
        });
        if (next) params.set("pageToken", next);
        const page = await this.json(await this.request(API + "/files?" + params, { signal }, epoch), signal);
        if (page.incompleteSearch !== false || !Array.isArray(page.files)) return fail2("incomplete");
        for (const f of page.files) {
          if (!object3(f) || typeof f.id !== "string" || f.trashed === true || !Array.isArray(f.parents) || !f.parents.includes(folder) || !object3(f.appProperties) || f.appProperties.cv_contract !== "rc-key-a1" || !hash(f.appProperties.cv_file) || typeof f.size !== "string" || !/^[1-9][0-9]*$/.test(f.size) || Number(f.size) > 2048) return fail2("incomplete");
          const fileId = id(f.id), bytes = await this.bytes(await this.request(API + "/files/" + fileId + "?alt=media", { signal }, epoch), 2048, signal);
          this.profileBytes(bytes);
          if (bytes.length !== Number(f.size) || await this.digest(bytes) !== f.appProperties.cv_file || out.some((p) => p.fileId === fileId)) return fail2("integrity");
          out.push({ fileId, sha256: f.appProperties.cv_file, bytes });
        }
        if (page.nextPageToken === void 0) next = "";
        else if (typeof page.nextPageToken !== "string" || !page.nextPageToken || page.nextPageToken.length > 4096 || seen.has(page.nextPageToken)) return fail2("incomplete");
        else {
          next = page.nextPageToken;
          seen.add(next);
        }
      } while (next);
      this.check(epoch, signal);
      return out;
    }
    async digest(bytes) {
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
    }
    async uploadProfile(fileId, folder, input, signal) {
      id(fileId);
      id(folder);
      const bytes = input.slice();
      this.profileBytes(bytes);
      const epoch = this.lease(), sha2562 = await this.digest(bytes);
      await this.folder(folder, signal);
      this.check(epoch, signal);
      const verify = async () => {
        const meta = await this.json(await this.request(API + "/files/" + fileId + "?fields=id,size,trashed,parents,appProperties", { signal }, epoch), signal);
        if (meta.id !== fileId || meta.trashed === true || !Array.isArray(meta.parents) || !meta.parents.includes(folder) || !object3(meta.appProperties) || meta.appProperties.cv_contract !== "rc-key-a1" || meta.appProperties.cv_file !== sha2562 || meta.size !== String(bytes.length)) return fail2("integrity");
        const back = await this.bytes(await this.request(API + "/files/" + fileId + "?alt=media", { signal }, epoch), 2048, signal);
        if (await this.digest(back) !== sha2562) return fail2("integrity");
        this.check(epoch, signal);
        return { fileId, sha256: sha2562, bytes: back };
      };
      try {
        return await verify();
      } catch (e) {
        if (!(e instanceof OpaqueDriveError) || e.code !== "missing") throw e;
      }
      const boundary = "rc_key_" + sha2562;
      const metadata = { id: fileId, name: "rc-sync-key-" + sha2562 + ".json", mimeType: "application/json", parents: [folder], appProperties: { cv_contract: "rc-key-a1", cv_file: sha2562 } };
      const body = `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
--${boundary}\r
Content-Type: application/json\r
\r
${new TextDecoder().decode(bytes)}\r
--${boundary}--`;
      await this.request(UPLOAD + "?uploadType=multipart&fields=id", { method: "POST", signal, headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body }, epoch, [409]);
      return verify();
    }
    version(v) {
      if (!object3(v) || typeof v.id !== "string" || !object3(v.appProperties)) return fail2("incomplete");
      const p = v.appProperties, size = typeof v.size === "string" && /^\d+$/.test(v.size) ? Number(v.size) : NaN;
      if (p.cv_contract !== "rc-v1" || !hash(p.cv_file) || !hash(p.cv_cipher) || !Number.isSafeInteger(size) || size < 1 || size > PACKET_LIMITS.file || v.trashed === true)
        return fail2("incomplete");
      let revision;
      try {
        revision = syncRevisionFromProperties(p);
      } catch {
        return fail2("incomplete");
      }
      return Object.freeze({
        fileId: id(v.id),
        fileSha256: p.cv_file,
        cipherSha256: p.cv_cipher,
        size,
        state: "unverified",
        ...revision ? { revision } : {}
      });
    }
    async list(folder, signal) {
      id(folder);
      const epoch = this.lease();
      await this.folder(folder, signal);
      this.check(epoch, signal);
      const versions = /* @__PURE__ */ new Map(), tokens = /* @__PURE__ */ new Set();
      let next = "";
      do {
        const p = new URLSearchParams({
          q: `'${folder}' in parents and trashed = false and appProperties has { key='cv_contract' and value='rc-v1' }`,
          pageSize: "1000",
          fields: "nextPageToken,incompleteSearch,files(id,size,trashed,parents,appProperties)"
        });
        if (next) p.set("pageToken", next);
        const page = await this.json(await this.request(API + "/files?" + p, { signal }, epoch), signal);
        if (page.incompleteSearch !== false || !Array.isArray(page.files)) return fail2("incomplete");
        for (const raw of page.files) {
          if (!object3(raw) || !Array.isArray(raw.parents) || !raw.parents.includes(folder)) return fail2("conflict");
          const v = this.version(raw), old = versions.get(v.fileId);
          if (old && JSON.stringify(old) !== JSON.stringify(v)) return fail2("conflict");
          versions.set(v.fileId, v);
        }
        if (page.nextPageToken === void 0) next = "";
        else if (typeof page.nextPageToken !== "string" || !page.nextPageToken || page.nextPageToken.length > 4096 || tokens.has(page.nextPageToken)) return fail2("incomplete");
        else {
          next = page.nextPageToken;
          tokens.add(next);
        }
      } while (next);
      this.check(epoch, signal);
      return [...versions.values()];
    }
    async verified(expected, epoch, folder, signal) {
      try {
        expected = Object.freeze({ ...expected, ...expected.revision !== void 0 ? { revision: readSyncRevision(expected.revision) } : {} });
      } catch {
        return fail2("integrity");
      }
      id(expected.fileId);
      const meta = await this.json(await this.request(API + "/files/" + expected.fileId + "?fields=id,size,trashed,appProperties,parents", { signal }, epoch), signal);
      const remote = this.version(meta);
      if (remote.fileId !== expected.fileId || remote.fileSha256 !== expected.fileSha256 || remote.cipherSha256 !== expected.cipherSha256 || remote.size !== expected.size || !sameSyncRevision(remote.revision, expected.revision) || folder !== void 0 && (!Array.isArray(meta.parents) || !meta.parents.includes(folder))) return fail2("integrity");
      const r = await this.request(API + "/files/" + expected.fileId + "?alt=media", { signal }, epoch);
      const bytes = await this.bytes(r, Math.min(PACKET_LIMITS.file, expected.size), signal);
      let packet;
      try {
        packet = await readRacePacket(bytes, expected.fileSha256);
      } catch {
        return fail2("integrity");
      }
      if (packet.info.cipherSha256 !== expected.cipherSha256 || packet.info.size !== expected.size) return fail2("integrity");
      this.check(epoch, signal);
      return { packet, proof: Object.freeze({ ...remote, verifiedAt: this.now(), state: "verified-bytes" }) };
    }
    async download(expected, signal, folder) {
      try {
        expected = Object.freeze({ ...expected, ...expected.revision !== void 0 ? { revision: readSyncRevision(expected.revision) } : {} });
      } catch {
        return fail2("integrity");
      }
      const epoch = this.lease();
      if (folder !== void 0) {
        await this.folder(folder, signal);
        this.check(epoch, signal);
      }
      return this.verified(expected, epoch, folder, signal);
    }
    async upload(fileId, folder, input, signal, progress = () => {
    }) {
      return this.uploadPacket(fileId, folder, input, void 0, signal, progress);
    }
    async uploadRevision(fileId, folder, input, revision, signal, progress = () => {
    }) {
      let checked;
      try {
        checked = readSyncRevision(revision);
      } catch {
        return fail2("conflict");
      }
      return this.uploadPacket(fileId, folder, input, checked, signal, progress);
    }
    async uploadPacket(fileId, folder, input, revision, signal, progress) {
      id(fileId);
      id(folder);
      const packet = await readRacePacket(input.copyBytes(), input.info.fileSha256), epoch = this.lease();
      await this.folder(folder, signal);
      this.check(epoch, signal);
      const expected = {
        fileId,
        fileSha256: packet.info.fileSha256,
        cipherSha256: packet.info.cipherSha256,
        size: packet.info.size,
        state: "unverified",
        ...revision ? { revision } : {}
      };
      try {
        return await this.verified(expected, epoch, folder, signal);
      } catch (e) {
        if (!(e instanceof OpaqueDriveError) || e.code !== "missing") throw e;
      }
      const meta = {
        id: fileId,
        name: "rc-" + expected.fileSha256 + ".json",
        mimeType: "application/json",
        parents: [folder],
        appProperties: {
          cv_contract: "rc-v1",
          cv_file: expected.fileSha256,
          cv_cipher: expected.cipherSha256,
          ...revision ? syncRevisionProperties(revision) : {}
        }
      };
      const start = await this.request(UPLOAD + "?uploadType=resumable&fields=id", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/json", "X-Upload-Content-Length": String(expected.size) },
        body: JSON.stringify(meta)
      }, epoch, [409]);
      if (start.status === 409) return this.verified(expected, epoch, folder, signal);
      const location2 = start.headers.get("Location");
      let session;
      try {
        session = new URL(location2 ?? "");
      } catch {
        return fail2("incomplete");
      }
      if (session.origin !== "https://www.googleapis.com" || session.pathname !== "/upload/drive/v3/files" || session.hash || session.username || session.password || session.searchParams.get("uploadType") !== "resumable" || !session.searchParams.get("upload_id") || session.searchParams.has("access_token")) return fail2("integrity");
      const bytes = packet.copyBytes(), chunkSize = 1024 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, bytes.length), chunk = bytes.slice(offset, end);
        const r = await this.request(session.href, { method: "PUT", signal, headers: {
          "Content-Type": "application/json",
          "Content-Range": `bytes ${offset}-${end - 1}/${bytes.length}`
        }, body: chunk.buffer }, epoch, [308]);
        if (r.status === 308) {
          if (end === bytes.length || r.headers.get("Range") !== "bytes=0-" + (end - 1)) return fail2("incomplete");
        } else if (end !== bytes.length || (await this.json(r, signal)).id !== fileId) return fail2("incomplete");
        progress(end, bytes.length);
      }
      return this.verified(expected, epoch, folder, signal);
    }
  };
  return __toCommonJS(drive_entry_exports);
})();
