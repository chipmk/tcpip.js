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
import { chunk } from './util.js';

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

export function serializeName(name: string): Uint8Array {
  const parts = name.split('.');
  const bytes = new Uint8Array(name.length + 2); // +2 for length bytes
  let offset = 0;

  for (const part of parts) {
    bytes[offset] = part.length;
    offset++;
    for (let i = 0; i < part.length; i++) {
      bytes[offset + i] = part.charCodeAt(i);
    }
    offset += part.length;
  }

  bytes[offset] = 0; // Root label
  return bytes.slice(0, offset + 1);
}

export function parseDnsType(type: number) {
  const [key] =
    Object.entries(TypeCode).find(([, value]) => value === type) ?? [];
  return key as DnsType;
}

export function serializeDnsType(type: DnsType) {
  return TypeCode[type];
}

export function parseDnsClass(cls: number) {
  const [key] =
    Object.entries(ClassCode).find(([, value]) => value === cls) ?? [];
  return key as DnsClass;
}

export function serializeDnsClass(cls: DnsClass) {
  return ClassCode[cls];
}

export function parseDnsOpCode(opcode: number) {
  const [key] =
    Object.entries(OpCode).find(([, value]) => value === opcode) ?? [];
  return key as DnsOpCode;
}

export function serializeDnsOpCode(opcode: DnsOpCode) {
  return OpCode[opcode];
}

export function parseDnsRCode(rcode: number) {
  const [key] =
    Object.entries(RCode).find(([, value]) => value === rcode) ?? [];
  return key as DnsRCode;
}

export function serializeDnsRCode(rcode: DnsRCode) {
  return RCode[rcode];
}

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
 * Serialize a TXT record value.
 */
export function serializeTxtValue(value: string) {
  const encoder = new TextEncoder();

  // TXT records are split into chunks of 255 bytes
  const parts = chunk(value, 255);

  // Each part needs a length byte followed by the text
  const buffer = new Uint8Array(parts.length * (1 + 255));

  let offset = 0;

  for (const part of parts) {
    buffer[offset] = part.length;
    buffer.set(encoder.encode(part), offset + 1);
    offset += 1 + 255;
  }

  return buffer;
}

export function serializeResourceData(record: DnsRecord) {
  switch (record.type) {
    case 'A':
      return serializeIPv4Address(record.ip);
    case 'AAAA':
      return serializeIPv6Address(record.ip);
    case 'TXT':
      return serializeTxtValue(record.value);
    case 'PTR':
      return serializeName(record.ptr);
    default:
      throw new Error('unsupported record type');
  }
}

export function serializeAnswer(record: DnsRecord) {
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

export function parseDnsMessage(data: Uint8Array): DnsMessage {
  if (data.length < 12) {
    throw new Error('DNS message is too short');
  }

  let offset = 0;

  // Parse header
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
  offset = 12;

  // Parse questions
  const questions: DnsQuestion[] = [];
  for (let i = 0; i < header.questionCount; i++) {
    const [name, newOffset] = parseName(data, offset);
    offset = newOffset;

    const type = parseDnsType(view.getUint16(offset));
    const cls = parseDnsClass(view.getUint16(offset + 2));
    offset += 4;

    questions.push({ name, type, class: cls });
  }

  return {
    header,
    questions,
    answers: [],
    authorities: [],
    additionals: [],
  };
}

export function serializeDnsMessage(message: DnsMessage): Uint8Array {
  const HEADER_LENGTH = 12;

  const questions = message.questions.map(serializeQuestion);
  const answers = message.answers.map(serializeAnswer);

  let size = HEADER_LENGTH;

  // Add space for questions
  for (const question of questions) {
    size += question.length;
  }

  // Add space for answers
  for (const answer of answers) {
    size += answer.length;
  }

  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  // Write header
  view.setUint16(0, message.header.id);
  buffer[2] =
    (message.header.isResponse ? 0x80 : 0) |
    ((serializeDnsOpCode(message.header.opcode) & 0x0f) << 3) |
    (message.header.isAuthoritativeAnswer ? 0x04 : 0) |
    (message.header.isTruncated ? 0x02 : 0) |
    (message.header.isRecursionDesired ? 0x01 : 0);
  buffer[3] =
    (message.header.isRecursionAvailable ? 0x80 : 0) |
    (serializeDnsRCode(message.header.rcode) & 0x0f);
  view.setUint16(4, message.questions.length);
  view.setUint16(6, message.answers.length);
  view.setUint16(8, message.authorities.length);
  view.setUint16(10, message.additionals.length);

  offset = HEADER_LENGTH;

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

  return buffer;
}

/**
 * Parses an IPv4 address Uint8Array into a string.
 */
export function parseIPv4Address(data: Uint8Array) {
  return data.join('.');
}

/**
 * Serialize an IPv4 address string into a Uint8Array.
 */
export function serializeIPv4Address(ip: string) {
  return new Uint8Array(ip.split('.').map((byte) => parseInt(byte, 10)));
}

/**
 * Parses an IPv6 address Uint8Array into a string.
 */
export function parseIPv6Address(data: Uint8Array) {
  return data
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')
    .match(/.{1,4}/g)!
    .join(':');
}

/**
 * Serialize an IPv6 address string into a Uint8Array.
 */
export function serializeIPv6Address(ip: string) {
  return new Uint8Array(
    ip.split(':').flatMap((n) => {
      const num = parseInt(n, 16);
      return [num >> 8, num & 0xff];
    })
  );
}
