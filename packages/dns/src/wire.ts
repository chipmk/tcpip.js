import {
  compressIPv6,
  expandIPv6,
  parseIPv4Address,
  parseIPv6Address,
  serializeIPv4Address,
  serializeIPv6Address,
} from '@tcpip/wire';
import { ClassCode, OpCode, RCode, TypeCode } from './constants.js';
import type {
  DnsClass,
  DnsHeader,
  DnsMessage,
  DnsOpCode,
  DnsQuestion,
  DnsRCode,
  DnsRecord,
  DnsType,
} from './types.js';

/**
 * Parses a DNS name.
 *
 * TODO: support name compression
 */
export function parseName(
  data: Uint8Array,
  offset: number
): [name: string, offset: number] {
  const parts: string[] = [];
  let currentOffset = offset;

  while (true) {
    const length = data[currentOffset];
    if (length === undefined || length === 0) {
      break;
    }

    currentOffset++;
    const part = new TextDecoder().decode(
      data.slice(currentOffset, currentOffset + length)
    );
    parts.push(part);
    currentOffset += length;
  }

  return [parts.join('.'), currentOffset + 1];
}

/**
 * Serializes a DNS name.
 *
 * TODO: support name compression
 */
export function serializeName(name: string): Uint8Array {
  const parts = name.split('.');
  const bytes = new Uint8Array(name.length + 2); // +2 for length bytes
  let offset = 0;

  if (name !== '') {
    for (const part of parts) {
      bytes[offset] = part.length;
      offset++;
      for (let i = 0; i < part.length; i++) {
        bytes[offset + i] = part.charCodeAt(i);
      }
      offset += part.length;
    }
  }

  bytes[offset] = 0; // Root label
  return bytes.slice(0, offset + 1);
}

/**
 * Parses a DNS type.
 */
export function parseDnsType(type: number) {
  const [key] =
    Object.entries(TypeCode).find(([, value]) => value === type) ?? [];

  if (!key) {
    throw new Error(`unknown dns type: ${type}`);
  }

  return key as DnsType;
}

/**
 * Serializes a DNS type.
 */
export function serializeDnsType(type: DnsType) {
  if (!(type in TypeCode)) {
    throw new Error(`unknown dns type: ${type}`);
  }

  return TypeCode[type];
}

/**
 * Parses a DNS class.
 */
export function parseDnsClass(cls: number) {
  const [key] =
    Object.entries(ClassCode).find(([, value]) => value === cls) ?? [];

  if (!key) {
    throw new Error(`unknown dns class: ${cls}`);
  }

  return key as DnsClass;
}

/**
 * Serializes a DNS class.
 */
export function serializeDnsClass(cls: DnsClass) {
  if (!(cls in ClassCode)) {
    throw new Error(`unknown dns class: ${cls}`);
  }

  return ClassCode[cls];
}

/**
 * Parses a DNS opcode (operation code).
 */
export function parseDnsOpCode(opcode: number) {
  const [key] =
    Object.entries(OpCode).find(([, value]) => value === opcode) ?? [];

  if (!key) {
    throw new Error(`unknown dns opcode: ${opcode}`);
  }

  return key as DnsOpCode;
}

/**
 * Serializes a DNS opcode (operation code).
 */
export function serializeDnsOpCode(opcode: DnsOpCode) {
  if (!(opcode in OpCode)) {
    throw new Error(`unknown dns opcode: ${opcode}`);
  }

  return OpCode[opcode];
}

/**
 * Parses a DNS RCode (response code).
 */
export function parseDnsRCode(rcode: number) {
  const [key] =
    Object.entries(RCode).find(([, value]) => value === rcode) ?? [];

  if (!key) {
    throw new Error(`unknown dns rcode: ${rcode}`);
  }

  return key as DnsRCode;
}

/**
 * Serializes a DNS RCode (response code).
 */
export function serializeDnsRCode(rcode: DnsRCode) {
  if (!(rcode in RCode)) {
    throw new Error(`unknown dns rcode: ${rcode}`);
  }

  return RCode[rcode];
}

/**
 * Parses a DNS question section.
 */
export function parseQuestion(
  data: Uint8Array,
  offset: number
): [question: DnsQuestion, offset: number] {
  const [name, nameOffset] = parseName(data, offset);
  const view = new DataView(data.buffer);

  const type = parseDnsType(view.getUint16(nameOffset));
  const cls = parseDnsClass(view.getUint16(nameOffset + 2));

  return [{ name, type, class: cls }, nameOffset + 4];
}

/**
 * Serializes a DNS question section.
 */
export function serializeQuestion(q: DnsQuestion) {
  const nameBytes = serializeName(q.name);
  const buffer = new Uint8Array(nameBytes.length + 4);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  buffer.set(nameBytes, offset);
  offset += nameBytes.length;

  view.setUint16(offset, serializeDnsType(q.type));
  view.setUint16(offset + 2, serializeDnsClass(q.class));
  return buffer;
}

/**
 * Parses a TXT record value.
 */
export function parseTxtValue(
  data: Uint8Array,
  offset: number,
  length: number
): [value: string, offset: number] {
  const parts: string[] = [];
  let currentOffset = offset;
  const endOffset = offset + length;

  while (currentOffset < endOffset) {
    const partLength = data[currentOffset];
    if (partLength === undefined) break;

    currentOffset++;
    const part = new TextDecoder().decode(
      data.slice(currentOffset, currentOffset + partLength)
    );
    parts.push(part);
    currentOffset += partLength;
  }

  return [parts.join(''), currentOffset];
}

/**
 * Serializes a TXT record value.
 *
 * Splits `value` into character-strings of max 255 bytes.
 */
export function serializeTxtValue(value: string) {
  // For empty string, return a single zero length byte
  if (value.length === 0) {
    return new Uint8Array([0]);
  }

  const encoder = new TextEncoder();
  const encoded = encoder.encode(value);

  // Split into chunks of max 255 bytes
  const parts: Uint8Array[] = [];
  for (let i = 0; i < encoded.length; i += 255) {
    parts.push(encoded.slice(i, Math.min(i + 255, encoded.length)));
  }

  // Calculate total buffer size needed: 1 length byte + actual content for each part
  const totalSize = parts.reduce((sum, part) => sum + 1 + part.length, 0);
  const buffer = new Uint8Array(totalSize);

  let offset = 0;
  for (const part of parts) {
    buffer[offset] = part.length;
    buffer.set(part, offset + 1);
    offset += 1 + part.length;
  }

  return buffer;
}

/**
 * Parses a DNS resource record (answer, authority, or additional).
 */
export function parseResourceRecord(
  data: Uint8Array,
  offset: number
): [record: DnsRecord, offset: number] {
  const [name, nameOffset] = parseName(data, offset);
  const view = new DataView(data.buffer);

  const type = parseDnsType(view.getUint16(nameOffset));
  const cls = parseDnsClass(view.getUint16(nameOffset + 2));
  const ttl = view.getUint32(nameOffset + 4);
  const rdLength = view.getUint16(nameOffset + 8);

  offset = nameOffset + 10;

  switch (type) {
    case 'A': {
      const ip = parseIPv4Address(data.slice(offset, offset + rdLength));
      const newOffset = offset + rdLength;
      return [{ name, class: cls, ttl, type, ip }, newOffset];
    }
    case 'AAAA': {
      const ip = parseIPv6Address(data.slice(offset, offset + rdLength));
      const compressedIP = compressIPv6(ip);
      const newOffset = offset + rdLength;
      return [{ name, class: cls, ttl, type, ip: compressedIP }, newOffset];
    }
    case 'TXT': {
      const [value, newOffset] = parseTxtValue(data, offset, rdLength);
      return [{ name, class: cls, ttl, type, value }, newOffset];
    }
    case 'PTR': {
      const [ptr, newOffset] = parseName(data, offset);
      return [{ name, class: cls, ttl, type, ptr }, newOffset];
    }
    default: {
      throw new Error(`unsupported record type: ${type}`);
    }
  }
}

/**
 * Serializes DNS resource record data.
 */
export function serializeResourceData(record: DnsRecord) {
  switch (record.type) {
    case 'A':
      return serializeIPv4Address(record.ip);
    case 'AAAA':
      return serializeIPv6Address(expandIPv6(record.ip));
    case 'TXT':
      return serializeTxtValue(record.value);
    case 'PTR':
      return serializeName(record.ptr);
    default:
      throw new Error('unsupported record type');
  }
}

/**
 * Serializes a DNS resource record (answer, authority, or additional).
 */
export function serializeResourceRecord(record: DnsRecord) {
  const HEADER_LENGTH = 10;

  const nameBytes = serializeName(record.name);
  const resourceData = serializeResourceData(record);

  const buffer = new Uint8Array(
    nameBytes.length + HEADER_LENGTH + resourceData.length
  );
  const view = new DataView(buffer.buffer);
  let offset = 0;

  buffer.set(nameBytes, offset);
  offset += nameBytes.length;

  // Write the 10 byte header
  view.setUint16(offset, serializeDnsType(record.type));
  view.setUint16(offset + 2, serializeDnsClass(record.class));
  view.setUint32(offset + 4, record.ttl);
  view.setUint16(offset + 8, resourceData.length);

  // Increment offset over the header
  offset += HEADER_LENGTH;

  // Write the resource data
  buffer.set(resourceData, offset);

  return buffer;
}

/**
 * Parses a DNS header.
 */
export function parseHeader(
  data: Uint8Array
): [header: DnsHeader, offset: number] {
  if (data.length < 12) {
    throw new Error('DNS header is too short');
  }

  const view = new DataView(data.buffer);

  const header: DnsHeader = {
    id: view.getUint16(0),
    isResponse: Boolean(data[2]! & 0x80),
    opcode: parseDnsOpCode((data[2]! >> 3) & 0x0f),
    isAuthoritativeAnswer: Boolean(data[2]! & 0x04),
    isTruncated: Boolean(data[2]! & 0x02),
    isRecursionDesired: Boolean(data[2]! & 0x01),
    isRecursionAvailable: Boolean(data[3]! & 0x80),
    rcode: parseDnsRCode(data[3]! & 0x0f),
    questionCount: view.getUint16(4),
    answerCount: view.getUint16(6),
    authorityCount: view.getUint16(8),
    additionalCount: view.getUint16(10),
  };

  return [header, 12]; // Header is always 12 bytes
}

/**
 * Serializes a DNS header.
 */
export function serializeHeader(header: DnsHeader): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, header.id);

  buffer[2] =
    (header.isResponse ? 0x80 : 0) |
    ((serializeDnsOpCode(header.opcode) & 0x0f) << 3) |
    (header.isAuthoritativeAnswer ? 0x04 : 0) |
    (header.isTruncated ? 0x02 : 0) |
    (header.isRecursionDesired ? 0x01 : 0);

  buffer[3] =
    (header.isRecursionAvailable ? 0x80 : 0) |
    (serializeDnsRCode(header.rcode) & 0x0f);

  view.setUint16(4, header.questionCount);
  view.setUint16(6, header.answerCount);
  view.setUint16(8, header.authorityCount);
  view.setUint16(10, header.additionalCount);

  return buffer;
}

/**
 * Parses a DNS message.
 */
export function parseDnsMessage(data: Uint8Array): DnsMessage {
  if (data.length < 12) {
    throw new Error('DNS message is too short');
  }

  let offset = 0;

  // Parse header
  const [header, newOffset] = parseHeader(data);
  offset = newOffset;

  // Parse questions
  const questions: DnsQuestion[] = [];
  for (let i = 0; i < header.questionCount; i++) {
    const [question, newOffset] = parseQuestion(data, offset);
    questions.push(question);
    offset = newOffset;
  }

  // Parse answers
  const answers: DnsRecord[] = [];
  for (let i = 0; i < header.answerCount; i++) {
    const [record, newOffset] = parseResourceRecord(data, offset);
    answers.push(record);
    offset = newOffset;
  }

  // Parse authorities
  const authorities: DnsRecord[] = [];
  for (let i = 0; i < header.authorityCount; i++) {
    const [record, newOffset] = parseResourceRecord(data, offset);
    authorities.push(record);
    offset = newOffset;
  }

  // Parse additionals
  const additionals: DnsRecord[] = [];
  for (let i = 0; i < header.additionalCount; i++) {
    const [record, newOffset] = parseResourceRecord(data, offset);
    additionals.push(record);
    offset = newOffset;
  }

  return {
    header,
    questions,
    answers,
    authorities,
    additionals,
  };
}

/**
 * Serializes a DNS message.
 */
export function serializeDnsMessage(message: DnsMessage): Uint8Array {
  // Update header counts
  message.header.questionCount = message.questions.length;
  message.header.answerCount = message.answers?.length ?? 0;
  message.header.authorityCount = message.authorities?.length ?? 0;
  message.header.additionalCount = message.additionals?.length ?? 0;

  const headerBytes = serializeHeader(message.header);
  const questions = message.questions.map(serializeQuestion);
  const answers = message.answers?.map(serializeResourceRecord) ?? [];
  const authorities = message.authorities?.map(serializeResourceRecord) ?? [];
  const additionals = message.additionals?.map(serializeResourceRecord) ?? [];

  let size = headerBytes.length;

  // Add space for questions
  for (const question of questions) {
    size += question.length;
  }

  // Add space for answers
  for (const answer of answers) {
    size += answer.length;
  }

  // Add space for authorities
  for (const authority of authorities) {
    size += authority.length;
  }

  // Add space for additionals
  for (const additional of additionals) {
    size += additional.length;
  }

  const buffer = new Uint8Array(size);
  let offset = 0;

  // Write header
  buffer.set(headerBytes, offset);
  offset += headerBytes.length;

  // Write questions
  for (const question of questions) {
    buffer.set(question, offset);
    offset += question.length;
  }

  // Write answers
  for (const answer of answers) {
    buffer.set(answer, offset);
    offset += answer.length;
  }

  // Write authorities
  for (const authority of authorities) {
    buffer.set(authority, offset);
    offset += authority.length;
  }

  // Write additionals
  for (const additional of additionals) {
    buffer.set(additional, offset);
    offset += additional.length;
  }

  return buffer;
}
