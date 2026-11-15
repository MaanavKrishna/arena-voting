"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchIpfsJson, parseIpfsUri } from "@/lib/ipfs";
import {
  UNTITLED_ENTRY,
  parseContestMetadata,
  parseEntryMetadata,
  type ContestMetadata,
  type EntryMetadata,
} from "@/lib/metadata";

export type MetadataStatus = "loading" | "ready" | "failed" | "missing";

const EMPTY_CONTEST: ContestMetadata = { version: 1, description: "" };

/**
 * Content-addressed, so it never goes stale. Hostile or malformed JSON parses to the fallback
 * (never throws); only a total fetch failure surfaces as an error.
 */
export function entryMetadataOptions(uri: string) {
  return queryOptions({
    queryKey: ["metadata", "entry", uri] as const,
    queryFn: async () => parseEntryMetadata(await fetchIpfsJson(uri)),
    enabled: parseIpfsUri(uri) !== null,
    staleTime: Infinity,
    retry: 1,
  });
}

export function contestMetadataOptions(uri: string) {
  return queryOptions({
    queryKey: ["metadata", "contest", uri] as const,
    queryFn: async () => parseContestMetadata(await fetchIpfsJson(uri)),
    enabled: parseIpfsUri(uri) !== null,
    staleTime: Infinity,
    retry: 1,
  });
}

export function metadataStatus(uri: string, q: { isSuccess: boolean; isError: boolean }): MetadataStatus {
  if (parseIpfsUri(uri) === null) return "missing";
  if (q.isSuccess) return "ready";
  if (q.isError) return "failed";
  return "loading";
}

export function useMetadata(uri: string, kind: "entry"): { data: EntryMetadata; status: MetadataStatus };
export function useMetadata(uri: string, kind: "contest"): { data: ContestMetadata; status: MetadataStatus };
export function useMetadata(
  uri: string,
  kind: "entry" | "contest",
): { data: EntryMetadata | ContestMetadata; status: MetadataStatus } {
  const entry = useQuery({ ...entryMetadataOptions(uri), enabled: kind === "entry" && parseIpfsUri(uri) !== null });
  const contest = useQuery({
    ...contestMetadataOptions(uri),
    enabled: kind === "contest" && parseIpfsUri(uri) !== null,
  });
  const q = kind === "entry" ? entry : contest;
  return {
    data: q.data ?? (kind === "entry" ? UNTITLED_ENTRY : EMPTY_CONTEST),
    status: metadataStatus(uri, q),
  };
}
