import { getCollection } from "astro:content";
import {
  type Locale,
  noteCategory,
  noteMatchesLocale,
  sortCategories,
  PAGE_ORDER,
  navOrderIndex,
  parseNoteId,
} from "@/lib/i18n";

export interface CategorizedNote {
  name: string;
  notes: Array<{
    id: string;
    title: string;
    description: string;
    growthStage: string;
    updatedAt: Date;
  }>;
}

function pageSlug(id: string): string {
  const { rest } = parseNoteId(id);
  const parts = rest.split("/");
  return parts[parts.length - 1] || rest;
}

function byNavOrder(category: string) {
  const order = PAGE_ORDER[category] ?? [];
  return (a: { id: string }, b: { id: string }) => {
    const ia = navOrderIndex(order, pageSlug(a.id));
    const ib = navOrderIndex(order, pageSlug(b.id));
    if (ia !== ib) return ia - ib;
    return a.id.localeCompare(b.id);
  };
}

export async function getCategorizedNotes(
  locale: Locale = "en",
): Promise<CategorizedNote[]> {
  const allNotes = await getCollection("wiki");

  const grouped = allNotes.reduce(
    (acc, note) => {
      if (!noteMatchesLocale(note.id, locale)) return acc;
      // hide English wiki hub index from home cards
      if (note.id === "index") return acc;

      const category = noteCategory(note.id);
      if (!acc[category]) acc[category] = [];
      acc[category].push({
        id: note.id,
        title: note.data.title,
        description: note.data.description || "",
        growthStage: note.data.growthStage || "",
        updatedAt: note.data.updatedAt,
      });
      return acc;
    },
    {} as Record<string, CategorizedNote["notes"]>,
  );

  return sortCategories(
    Object.entries(grouped).map(([name, notes]) => ({
      name,
      notes: notes.sort(byNavOrder(name)),
    })),
  );
}
