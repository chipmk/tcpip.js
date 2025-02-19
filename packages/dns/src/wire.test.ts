import { describe, expect, it } from 'vitest';
import type { DnsMessage, DnsQuestion, DnsRecord } from './types.js';
import {
  parseDnsMessage,
  parseHeader,
  parseName,
  parseQuestion,
  parseResourceRecord,
  parseTxtValue,
  serializeDnsMessage,
  serializeHeader,
  serializeName,
  serializeQuestion,
  serializeResourceRecord,
  serializeTxtValue,
} from './wire.js';

describe('parseName', () => {
  it('should parse a simple DNS name', () => {
    const data = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      7,
      0x65,
      0x78,
      0x61,
      0x6d,
      0x70,
      0x6c,
      0x65, // example
      3,
      0x63,
      0x6f,
      0x6d, // com
      0, // root label
    ]);

    const [name, offset] = parseName(data, 0);

    expect(name).toBe('www.example.com');
    expect(offset).toBe(17); // The next byte after the name
  });

  it('should parse name with offset', () => {
    const data = new Uint8Array([
      0xff,
      0xff,
      0xff, // garbage data
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
    ]);

    const [name, offset] = parseName(data, 3);

    expect(name).toBe('www');
    expect(offset).toBe(8);
  });

  it('should handle empty name', () => {
    const data = new Uint8Array([0]); // just root label

    const [name, offset] = parseName(data, 0);

    expect(name).toBe('');
    expect(offset).toBe(1);
  });
});

describe('serializeName', () => {
  it('should serialize a simple DNS name', () => {
    const name = 'www.example.com';
    const expected = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      7,
      0x65,
      0x78,
      0x61,
      0x6d,
      0x70,
      0x6c,
      0x65, // example
      3,
      0x63,
      0x6f,
      0x6d, // com
      0, // root label
    ]);

    const result = serializeName(name);
    expect(result).toEqual(expected);
  });

  it('should serialize single label name', () => {
    const name = 'www';
    const expected = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
    ]);

    const result = serializeName(name);
    expect(result).toEqual(expected);
  });

  it('should serialize empty name', () => {
    const name = '';
    const expected = new Uint8Array([0]); // just root label

    const result = serializeName(name);
    expect(result).toEqual(expected);
  });
});

describe('parseQuestion', () => {
  it('should parse a DNS question', () => {
    const data = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      7,
      0x65,
      0x78,
      0x61,
      0x6d,
      0x70,
      0x6c,
      0x65, // example
      3,
      0x63,
      0x6f,
      0x6d, // com
      0, // root label
      0x00,
      0x01, // type A
      0x00,
      0x01, // class IN
    ]);

    const [question, offset] = parseQuestion(data, 0);

    expect(question).toEqual({
      name: 'www.example.com',
      type: 'A',
      class: 'IN',
    });
    expect(offset).toBe(21); // name length (17) + type (2) + class (2)
  });
});

describe('serializeQuestion', () => {
  it('should serialize a DNS question', () => {
    const question: DnsQuestion = {
      name: 'www.example.com',
      type: 'A',
      class: 'IN',
    };

    const expected = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      7,
      0x65,
      0x78,
      0x61,
      0x6d,
      0x70,
      0x6c,
      0x65, // example
      3,
      0x63,
      0x6f,
      0x6d, // com
      0, // root label
      0x00,
      0x01, // type A
      0x00,
      0x01, // class IN
    ]);

    const result = serializeQuestion(question);
    expect(result).toEqual(expected);
  });
});

describe('parseTxtValue', () => {
  it('should parse a simple TXT value', () => {
    const data = new Uint8Array([
      5, // Length of first part
      0x68,
      0x65,
      0x6c,
      0x6c,
      0x6f, // 'hello'
    ]);

    const [value, offset] = parseTxtValue(data, 0, 6);

    expect(value).toBe('hello');
    expect(offset).toBe(6);
  });

  it('should parse multiple parts', () => {
    const data = new Uint8Array([
      5, // Length of first part
      0x68,
      0x65,
      0x6c,
      0x6c,
      0x6f, // 'hello'
      5, // Length of second part
      0x77,
      0x6f,
      0x72,
      0x6c,
      0x64, // 'world'
    ]);

    const [value, offset] = parseTxtValue(data, 0, 12);

    expect(value).toBe('helloworld');
    expect(offset).toBe(12);
  });

  it('should handle empty value', () => {
    const data = new Uint8Array([0]); // Zero length

    const [value, offset] = parseTxtValue(data, 0, 1);

    expect(value).toBe('');
    expect(offset).toBe(1);
  });
});

describe('serializeTxtValue', () => {
  it('should serialize a simple TXT value', () => {
    const value = 'hello';
    const expected = new Uint8Array([
      5, // Length
      0x68,
      0x65,
      0x6c,
      0x6c,
      0x6f, // 'hello'
    ]);

    const result = serializeTxtValue(value);
    expect(result.slice(0, 6)).toEqual(expected);
  });

  it('should serialize a value that needs chunking', () => {
    const value = 'a'.repeat(300);
    const result = serializeTxtValue(value);

    // First chunk
    expect(result[0]).toBe(255); // First chunk length
    expect(result.slice(1, 256)).toEqual(new Uint8Array(255).fill(0x61)); // 'a' repeated

    // Second chunk
    expect(result[256]).toBe(45); // Second chunk length (300-255=45)
    expect(result.slice(257, 302)).toEqual(new Uint8Array(45).fill(0x61));
  });

  it('should handle empty string', () => {
    const value = '';
    const expected = new Uint8Array([0]); // Zero length

    const result = serializeTxtValue(value);
    expect(result.slice(0, 1)).toEqual(expected);
  });
});

describe('parseResourceRecord', () => {
  it('should parse an A record', () => {
    const data = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x01, // type A
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x04, // rdlength = 4
      0x0a,
      0x00,
      0x00,
      0x01, // IP = 10.0.0.1
    ]);

    const [record, offset] = parseResourceRecord(data, 0);

    expect(record).toEqual({
      name: 'www',
      type: 'A',
      class: 'IN',
      ttl: 60,
      ip: '10.0.0.1',
    });
    expect(offset).toBe(19);
  });

  it('should parse an AAAA record', () => {
    const data = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x1c, // type AAAA
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x10, // rdlength = 16
      0x20,
      0x01,
      0x0d,
      0xb8,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x01, // IP = 2001:db8::1
    ]);

    const [record, offset] = parseResourceRecord(data, 0);

    expect(record).toEqual({
      name: 'www',
      type: 'AAAA',
      class: 'IN',
      ttl: 60,
      ip: '2001:db8::1',
    });
    expect(offset).toBe(31);
  });

  it('should parse a TXT record', () => {
    const data = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x10, // type TXT
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x06, // rdlength = 6
      0x05,
      0x68,
      0x65,
      0x6c,
      0x6c,
      0x6f, // "hello"
    ]);

    const [record, offset] = parseResourceRecord(data, 0);

    expect(record).toEqual({
      name: 'www',
      type: 'TXT',
      class: 'IN',
      ttl: 60,
      value: 'hello',
    });
    expect(offset).toBe(21);
  });

  it('should parse a PTR record', () => {
    const data = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x0c, // type PTR
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x05, // rdlength = 5
      0x04,
      0x68,
      0x6f,
      0x73,
      0x74, // "host"
      0, // root label
    ]);

    const [record, offset] = parseResourceRecord(data, 0);

    expect(record).toEqual({
      name: 'www',
      type: 'PTR',
      class: 'IN',
      ttl: 60,
      ptr: 'host',
    });
    expect(offset).toBe(21);
  });

  it('should throw on unsupported record type', () => {
    const data = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0xff, // invalid type
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x00, // rdlength = 0
    ]);

    expect(() => parseResourceRecord(data, 0)).toThrow(
      `unsupported record type: ANY`
    );
  });
});

describe('serializeResourceRecord', () => {
  it('should serialize an A record', () => {
    const record: DnsRecord = {
      name: 'www',
      type: 'A',
      class: 'IN',
      ttl: 60,
      ip: '10.0.0.1',
    };

    const expected = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x01, // type A
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x04, // rdlength = 4
      0x0a,
      0x00,
      0x00,
      0x01, // IP = 10.0.0.1
    ]);

    const result = serializeResourceRecord(record);
    expect(result).toEqual(expected);
  });

  it('should serialize an AAAA record', () => {
    const record: DnsRecord = {
      name: 'www',
      type: 'AAAA',
      class: 'IN',
      ttl: 60,
      ip: '2001:db8::1',
    };

    const expected = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x1c, // type AAAA
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x10, // rdlength = 16
      0x20,
      0x01,
      0x0d,
      0xb8,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x01, // IP = 2001:db8::1
    ]);

    const result = serializeResourceRecord(record);
    expect(result).toEqual(expected);
  });

  it('should serialize a TXT record', () => {
    const record: DnsRecord = {
      name: 'www',
      type: 'TXT',
      class: 'IN',
      ttl: 60,
      value: 'hello',
    };

    const expected = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x10, // type TXT
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x06, // rdlength = 6
      0x05,
      0x68,
      0x65,
      0x6c,
      0x6c,
      0x6f, // "hello"
    ]);

    const result = serializeResourceRecord(record);
    expect(result).toEqual(expected);
  });

  it('should serialize a PTR record', () => {
    const record: DnsRecord = {
      name: 'www',
      type: 'PTR',
      class: 'IN',
      ttl: 60,
      ptr: 'host',
    };

    const expected = new Uint8Array([
      3,
      0x77,
      0x77,
      0x77, // www
      0, // root label
      0x00,
      0x0c, // type PTR
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x06, // rdlength = 6
      0x04,
      0x68,
      0x6f,
      0x73,
      0x74, // "host"
      0, // root label
    ]);

    const result = serializeResourceRecord(record);
    expect(result).toEqual(expected);
  });

  it('should throw on unsupported record type', () => {
    const record: any = {
      name: 'www',
      type: 'MX',
      class: 'IN',
      ttl: 60,
    };

    expect(() => serializeResourceRecord(record)).toThrow(
      'unsupported record type'
    );
  });
});

describe('parseHeader', () => {
  it('should throw error if data is too short', () => {
    const data = new Uint8Array(11); // Less than 12 bytes
    expect(() => parseHeader(data)).toThrow('DNS header is too short');
  });

  it('should parse a query header', () => {
    const data = new Uint8Array([
      0x12,
      0x34, // ID = 0x1234
      0x01,
      0x00, // Standard query, recursion desired
      0x00,
      0x01, // 1 question
      0x00,
      0x00, // 0 answers
      0x00,
      0x00, // 0 authority records
      0x00,
      0x00, // 0 additional records
    ]);

    const [header, offset] = parseHeader(data);

    expect(header).toEqual({
      id: 0x1234,
      isResponse: false,
      opcode: 'QUERY',
      isAuthoritativeAnswer: false,
      isTruncated: false,
      isRecursionDesired: true,
      isRecursionAvailable: false,
      rcode: 'NOERROR',
      questionCount: 1,
      answerCount: 0,
      authorityCount: 0,
      additionalCount: 0,
    });
    expect(offset).toBe(12);
  });

  it('should parse a response header', () => {
    const data = new Uint8Array([
      0x12,
      0x34, // ID = 0x1234
      0x84,
      0x80, // Response, recursion desired, recursion available
      0x00,
      0x01, // 1 question
      0x00,
      0x02, // 2 answers
      0x00,
      0x01, // 1 authority record
      0x00,
      0x03, // 3 additional records
    ]);

    const [header, offset] = parseHeader(data);

    expect(header).toEqual({
      id: 0x1234,
      isResponse: true,
      opcode: 'QUERY',
      isAuthoritativeAnswer: true,
      isTruncated: false,
      isRecursionDesired: false,
      isRecursionAvailable: true,
      rcode: 'NOERROR',
      questionCount: 1,
      answerCount: 2,
      authorityCount: 1,
      additionalCount: 3,
    });
    expect(offset).toBe(12);
  });

  it('should parse header with uncommon flag combinations', () => {
    const data = new Uint8Array([
      0x12,
      0x34, // ID = 0x1234
      0x97, // QR=1 (response), Opcode=2 (STATUS), AA=1, TC=1, RD=1
      0x85, // RA=1, Z=000 (reserved), RCODE=5 (REFUSED)
      0x00,
      0x00, // 0 questions
      0x00,
      0x00, // 0 answers
      0x00,
      0x00, // 0 authority records
      0x00,
      0x00, // 0 additional records
    ]);

    const [header, offset] = parseHeader(data);

    expect(header).toEqual({
      id: 0x1234,
      isResponse: true,
      opcode: 'STATUS',
      isAuthoritativeAnswer: true,
      isTruncated: true,
      isRecursionDesired: true,
      isRecursionAvailable: true,
      rcode: 'REFUSED',
      questionCount: 0,
      answerCount: 0,
      authorityCount: 0,
      additionalCount: 0,
    });
    expect(offset).toBe(12);
  });
});

describe('serializeHeader', () => {
  it('should serialize a query header', () => {
    const header = {
      id: 0x1234,
      isResponse: false,
      opcode: 'QUERY' as const,
      isAuthoritativeAnswer: false,
      isTruncated: false,
      isRecursionDesired: true,
      isRecursionAvailable: false,
      rcode: 'NOERROR' as const,
      questionCount: 1,
      answerCount: 0,
      authorityCount: 0,
      additionalCount: 0,
    };

    const expected = new Uint8Array([
      0x12,
      0x34, // ID = 0x1234
      0x01,
      0x00, // Standard query, recursion desired
      0x00,
      0x01, // 1 question
      0x00,
      0x00, // 0 answers
      0x00,
      0x00, // 0 authority records
      0x00,
      0x00, // 0 additional records
    ]);

    const result = serializeHeader(header);
    expect(result).toEqual(expected);
  });

  it('should serialize a response header', () => {
    const header = {
      id: 0x1234,
      isResponse: true,
      opcode: 'QUERY' as const,
      isAuthoritativeAnswer: true,
      isTruncated: false,
      isRecursionDesired: false,
      isRecursionAvailable: true,
      rcode: 'NOERROR' as const,
      questionCount: 1,
      answerCount: 2,
      authorityCount: 1,
      additionalCount: 3,
    };

    const expected = new Uint8Array([
      0x12,
      0x34, // ID = 0x1234
      0x84,
      0x80, // Response, recursion desired, recursion available
      0x00,
      0x01, // 1 question
      0x00,
      0x02, // 2 answers
      0x00,
      0x01, // 1 authority record
      0x00,
      0x03, // 3 additional records
    ]);

    const result = serializeHeader(header);
    expect(result).toEqual(expected);
  });

  it('should serialize header with uncommon flag combinations', () => {
    const header = {
      id: 0x1234,
      isResponse: true,
      opcode: 'STATUS' as const,
      isAuthoritativeAnswer: true,
      isTruncated: true,
      isRecursionDesired: true,
      isRecursionAvailable: true,
      rcode: 'REFUSED' as const,
      questionCount: 0,
      answerCount: 0,
      authorityCount: 0,
      additionalCount: 0,
    };

    const expected = new Uint8Array([
      0x12,
      0x34, // ID = 0x1234
      0x97,
      0x85, // Response, Status, AA=1, TC=1, RD=1, RA=1, RCODE=5
      0x00,
      0x00, // 0 questions
      0x00,
      0x00, // 0 answers
      0x00,
      0x00, // 0 authority records
      0x00,
      0x00, // 0 additional records
    ]);

    const result = serializeHeader(header);
    expect(result).toEqual(expected);
  });
});

describe('parseDnsMessage', () => {
  it('should throw error if data is too short', () => {
    const data = new Uint8Array(11); // Less than 12 bytes
    expect(() => parseDnsMessage(data)).toThrow('DNS message is too short');
  });

  it('should parse a complete DNS message', () => {
    const data = new Uint8Array([
      // Header
      0x12,
      0x34, // ID = 0x1234
      0x81,
      0x80, // Response, standard query, recursion desired & available
      0x00,
      0x01, // 1 question
      0x00,
      0x01, // 1 answer
      0x00,
      0x01, // 1 authority
      0x00,
      0x01, // 1 additional

      // Question section
      0x03,
      0x77,
      0x77,
      0x77, // www
      0x07,
      0x65,
      0x78,
      0x61,
      0x6d,
      0x70,
      0x6c,
      0x65, // example
      0x03,
      0x63,
      0x6f,
      0x6d, // com
      0x00, // root label
      0x00,
      0x01, // type A
      0x00,
      0x01, // class IN

      // Answer section
      0x03,
      0x77,
      0x77,
      0x77, // www
      0x00, // root label
      0x00,
      0x01, // type A
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x04, // rdlength = 4
      0x0a,
      0x00,
      0x00,
      0x01, // IP = 10.0.0.1

      // Authority section
      0x03,
      0x77,
      0x77,
      0x77, // www
      0x00, // root label
      0x00,
      0x10, // type TXT
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x06, // rdlength = 6
      0x05,
      0x68,
      0x65,
      0x6c,
      0x6c,
      0x6f, // "hello"

      // Additional section
      0x03,
      0x77,
      0x77,
      0x77, // www
      0x00, // root label
      0x00,
      0x1c, // type AAAA
      0x00,
      0x01, // class IN
      0x00,
      0x00,
      0x00,
      0x3c, // TTL = 60
      0x00,
      0x10, // rdlength = 16
      0x20,
      0x01,
      0x0d,
      0xb8,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x01, // IP = 2001:db8::1
    ]);

    const message = parseDnsMessage(data);

    expect(message).toEqual({
      header: {
        id: 0x1234,
        isResponse: true,
        opcode: 'QUERY',
        isAuthoritativeAnswer: false,
        isTruncated: false,
        isRecursionDesired: true,
        isRecursionAvailable: true,
        rcode: 'NOERROR',
        questionCount: 1,
        answerCount: 1,
        authorityCount: 1,
        additionalCount: 1,
      },
      questions: [
        {
          name: 'www.example.com',
          type: 'A',
          class: 'IN',
        },
      ],
      answers: [
        {
          name: 'www',
          type: 'A',
          class: 'IN',
          ttl: 60,
          ip: '10.0.0.1',
        },
      ],
      authorities: [
        {
          name: 'www',
          type: 'TXT',
          class: 'IN',
          ttl: 60,
          value: 'hello',
        },
      ],
      additionals: [
        {
          name: 'www',
          type: 'AAAA',
          class: 'IN',
          ttl: 60,
          ip: '2001:db8::1',
        },
      ],
    });
  });

  it('should parse a message with only header and questions', () => {
    const data = new Uint8Array([
      // Header
      0x12,
      0x34, // ID = 0x1234
      0x01,
      0x00, // Standard query
      0x00,
      0x01, // 1 question
      0x00,
      0x00, // 0 answers
      0x00,
      0x00, // 0 authorities
      0x00,
      0x00, // 0 additionals

      // Question section
      0x03,
      0x77,
      0x77,
      0x77, // www
      0x00, // root label
      0x00,
      0x01, // type A
      0x00,
      0x01, // class IN
    ]);

    const message = parseDnsMessage(data);

    expect(message).toEqual({
      header: {
        id: 0x1234,
        isResponse: false,
        opcode: 'QUERY',
        isAuthoritativeAnswer: false,
        isTruncated: false,
        isRecursionDesired: true,
        isRecursionAvailable: false,
        rcode: 'NOERROR',
        questionCount: 1,
        answerCount: 0,
        authorityCount: 0,
        additionalCount: 0,
      },
      questions: [
        {
          name: 'www',
          type: 'A',
          class: 'IN',
        },
      ],
      answers: [],
      authorities: [],
      additionals: [],
    });
  });
});

describe('serializeDnsMessage', () => {
  it('should serialize a complete DNS message', () => {
    const message: DnsMessage = {
      header: {
        id: 0x1234,
        isResponse: true,
        opcode: 'QUERY',
        isAuthoritativeAnswer: false,
        isTruncated: false,
        isRecursionDesired: true,
        isRecursionAvailable: true,
        rcode: 'NOERROR',
        questionCount: 0, // Will be updated automatically
        answerCount: 0,
        authorityCount: 0,
        additionalCount: 0,
      },
      questions: [
        {
          name: 'www.example.com',
          type: 'A',
          class: 'IN',
        },
      ],
      answers: [
        {
          name: 'www',
          type: 'A',
          class: 'IN',
          ttl: 60,
          ip: '10.0.0.1',
        },
      ],
      authorities: [
        {
          name: 'www',
          type: 'TXT',
          class: 'IN',
          ttl: 60,
          value: 'hello',
        },
      ],
      additionals: [
        {
          name: 'www',
          type: 'AAAA',
          class: 'IN',
          ttl: 60,
          ip: '2001:db8::1',
        },
      ],
    };

    const result = serializeDnsMessage(message);
    const parsed = parseDnsMessage(result);

    expect(parsed).toEqual(message);
  });

  it('should serialize a message with only header and questions', () => {
    const message: DnsMessage = {
      header: {
        id: 0x1234,
        isResponse: false,
        opcode: 'QUERY',
        isAuthoritativeAnswer: false,
        isTruncated: false,
        isRecursionDesired: true,
        isRecursionAvailable: false,
        rcode: 'NOERROR',
        questionCount: 0, // Will be updated automatically
        answerCount: 0,
        authorityCount: 0,
        additionalCount: 0,
      },
      questions: [
        {
          name: 'www',
          type: 'A',
          class: 'IN',
        },
      ],
      answers: [],
      authorities: [],
      additionals: [],
    };

    const result = serializeDnsMessage(message);
    const parsed = parseDnsMessage(result);

    expect(parsed).toEqual(message);
  });

  it('should handle message with no sections', () => {
    const message = {
      header: {
        id: 0x1234,
        isResponse: false,
        opcode: 'QUERY' as const,
        isAuthoritativeAnswer: false,
        isTruncated: false,
        isRecursionDesired: true,
        isRecursionAvailable: false,
        rcode: 'NOERROR' as const,
        questionCount: 0,
        answerCount: 0,
        authorityCount: 0,
        additionalCount: 0,
      },
      questions: [],
      answers: [],
      authorities: [],
      additionals: [],
    };

    const result = serializeDnsMessage(message);
    const parsed = parseDnsMessage(result);

    expect(parsed).toEqual(message);
  });
});
