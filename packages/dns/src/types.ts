import type { ClassCode, TypeCode, OpCode, RCode } from './constants.js';

export type DnsType = keyof typeof TypeCode;
export type DnsClass = keyof typeof ClassCode;
export type DnsOpCode = keyof typeof OpCode;
export type DnsRCode = keyof typeof RCode;

export type DnsHeader = {
  id: number;
  isResponse: boolean;
  opcode: DnsOpCode;
  isAuthoritativeAnswer: boolean;
  isTruncated: boolean;
  isRecursionDesired: boolean;
  isRecursionAvailable: boolean;
  rcode: DnsRCode;
  questionCount: number;
  answerCount: number;
  authorityCount: number;
  additionalCount: number;
};

export type DnsQuestion = {
  name: string;
  type: DnsType;
  class: DnsClass;
};

export type DnsBaseRecord = {
  name: string;
  class: DnsClass;
  ttl: number;
};

export type DnsARecord = DnsBaseRecord & {
  type: 'A';
  ip: string;
};

export type DnsAAAARecord = DnsBaseRecord & {
  type: 'AAAA';
  ip: string;
};

export type DnsTxtRecord = DnsBaseRecord & {
  type: 'TXT';
  value: string;
};

export type DnsPtrRecord = DnsBaseRecord & {
  type: 'PTR';
  ptr: string;
};

export type DnsRecord =
  | DnsARecord
  | DnsAAAARecord
  | DnsTxtRecord
  | DnsPtrRecord;

export type DnsBaseResponse = {
  ttl: number;
};

export type DnsAResponse = DnsBaseResponse & {
  type: 'A';
  ip: string;
};

export type DnsAAAAResponse = DnsBaseResponse & {
  type: 'AAAA';
  ip: string;
};

export type DnsTxtResponse = DnsBaseResponse & {
  type: 'TXT';
  value: string;
};

export type DnsPtrResponse = DnsBaseResponse & {
  type: 'PTR';
  ptr: string;
};

export type DnsResponse =
  | DnsAResponse
  | DnsAAAAResponse
  | DnsTxtResponse
  | DnsPtrResponse;

export type DnsQuery = {
  name: string;
  type: DnsType;
};

export type DnsMessage = {
  header: DnsHeader;
  questions: DnsQuestion[];
  answers: DnsRecord[];
  authorities: DnsRecord[];
  additionals: DnsRecord[];
};
