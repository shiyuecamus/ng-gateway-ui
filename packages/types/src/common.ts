interface CommonPageRequest {
  /**
   * 页码
   */
  page: number;
  /**
   * 分页数量
   */
  pageSize: number;
}

interface CommonTimeRangeRequest {
  startTime?: number;
  endTime?: number;
}

interface CommonSortRequest {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface CommonPageResponse<T> {
  /**
   * 页码
   */
  page: number;
  /**
   * 分页数量
   */
  pageSize: number;
  /**
   * 总数
   */
  total: number;
  /**
   * 总页数
   */
  pages: number;
  /**
   * 数据
   */
  records: T[];
}

// Channel report type
export const DataType = {
  Boolean: 0,
  Int8: 1,
  UInt8: 2,
  Int16: 3,
  UInt16: 4,
  Int32: 5,
  UInt32: 6,
  Int64: 7,
  UInt64: 8,
  Float32: 9,
  Float64: 10,
  String: 11,
  Binary: 12,
  Timestamp: 13,
} as const;

/**
 * Log level string union used by logging control APIs.
 */
export type LogLevel = 'DEBUG' | 'ERROR' | 'INFO' | 'TRACE' | 'WARN';

/**
 * TTL range view used by runtime log-level override APIs.
 */
export interface TtlRangeView {
  minMs: number;
  maxMs: number;
  defaultMs: number;
}

export type {
  CommonPageRequest,
  CommonPageResponse,
  CommonSortRequest,
  CommonTimeRangeRequest,
};
