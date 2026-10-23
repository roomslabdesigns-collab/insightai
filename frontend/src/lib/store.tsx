"use client";
// The active dataset, PM reviews and decisions live in the browser (localStorage), so the hosted app
// needs no database. Vectors live in Pinecone under the dataset's namespace.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CleanReport, Mapping } from "./clean";
import type { Recommendation, Row, Theme } from "./types";

export interface Dataset {
  name: string;
  createdAt: string;
  namespace: string;
  mapping: Mapping;
  themes: Theme[];
  rows: Row[];
  report: CleanReport & { fallbackLabels: number };
}

export type ReviewStatus = "approved" | "needs_evidence" | "rejected";
export interface Review {
  theme: string;
  recommendation?: Recommendation;
  status?: ReviewStatus;
  note?: string;
  decidedAt?: string;
}

const DATASET_KEY = "insightai.dataset.v1";
const REVIEWS_KEY = "insightai.reviews.v1";

const read = <T,>(key: string): T | null => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the session still works in memory */
  }
};

interface Store {
  ready: boolean;
  dataset: Dataset | null;
  setDataset: (d: Dataset | null) => void;
  reviews: Record<string, Review>;
  updateReview: (theme: string, patch: Partial<Review>) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [dataset, setDatasetState] = useState<Dataset | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  useEffect(() => {
    setDatasetState(read<Dataset>(DATASET_KEY));
    setReviews(read<Record<string, Review>>(REVIEWS_KEY) || {});
    setReady(true);
  }, []);

  const setDataset = useCallback((d: Dataset | null) => {
    setDatasetState(d);
    write(DATASET_KEY, d);
    setReviews({}); // reviews belong to a dataset
    write(REVIEWS_KEY, null);
  }, []);

  const updateReview = useCallback((theme: string, patch: Partial<Review>) => {
    setReviews((prev) => {
      const next = { ...prev, [theme]: { ...prev[theme], theme, ...patch } };
      write(REVIEWS_KEY, next);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ ready, dataset, setDataset, reviews, updateReview }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
