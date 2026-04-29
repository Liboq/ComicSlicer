import { Arrangement } from "./cropLayout";

export type HistoryEntry = {
  id: string;
  name: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  targetWidth: number;
  targetHeight: number;
  count: number;
  arrangement: Arrangement;
  cuts: number[];
  filenamePrefix: string;
  createdAt: number;
  updatedAt: number;
};

export type HistoryEntryInput = HistoryEntry;

export type HistoryEntryPatch = Partial<Pick<HistoryEntry, "targetWidth" | "targetHeight" | "count" | "arrangement" | "cuts" | "filenamePrefix" | "updatedAt">>;

export function createHistoryEntry(input: HistoryEntryInput): HistoryEntry {
  return {
    ...input,
    cuts: [...input.cuts],
  };
}

export function updateHistoryEntry(history: HistoryEntry[], id: string, patch: HistoryEntryPatch): HistoryEntry[] {
  return history.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          ...patch,
          cuts: patch.cuts ? [...patch.cuts] : entry.cuts,
        }
      : entry,
  );
}
