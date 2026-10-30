export interface ReplayBuffer {
  append(data: string): void;
  snapshot(): string;
  clear(): void;
  readonly length: number;
}

export function createReplayBuffer(maxLength: number): ReplayBuffer {
  let chunks: string[] = [];
  let head = 0;
  let length = 0;
  return {
    append(data: string): void {
      if (!data) return;
      chunks.push(data);
      length += data.length;
      while (length > maxLength) {
        const excess = length - maxLength;
        const first = chunks[head]!;
        if (first.length > excess) {
          chunks[head] = first.slice(excess);
          length = maxLength;
          break;
        }
        length -= first.length;
        head += 1;
      }
      if (head > 1_024 && head * 2 > chunks.length) {
        chunks = chunks.slice(head);
        head = 0;
      }
    },
    snapshot(): string {
      return chunks.slice(head).join("");
    },
    clear(): void {
      chunks = [];
      head = 0;
      length = 0;
    },
    get length(): number {
      return length;
    },
  };
}
