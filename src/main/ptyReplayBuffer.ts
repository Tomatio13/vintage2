export interface ReplayBuffer {
  append(data: string): void;
  snapshot(): string;
  clear(): void;
  readonly length: number;
}

export function createReplayBuffer(maxLength: number): ReplayBuffer {
  let chunks: string[] = [];
  let length = 0;
  return {
    append(data: string): void {
      if (!data) return;
      chunks.push(data);
      length += data.length;
      while (length > maxLength) {
        const excess = length - maxLength;
        const first = chunks[0]!;
        if (first.length > excess) {
          chunks[0] = first.slice(excess);
          length = maxLength;
          break;
        }
        length -= first.length;
        chunks.shift();
      }
    },
    snapshot(): string {
      return chunks.join("");
    },
    clear(): void {
      chunks = [];
      length = 0;
    },
    get length(): number {
      return length;
    },
  };
}
