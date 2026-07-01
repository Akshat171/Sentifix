import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface CodeChunk {
  repoFullName: string;
  filePath: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface SearchResult {
  filePath: string;
  content: string;
  similarity: number;
  source?: 'vector' | 'bm25' | 'hybrid';
}

const RRF_K = 60; // RRF constant — higher = less steep ranking

@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(private readonly dataSource: DataSource) {}

  async upsertChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50);
      const values = batch
        .map((_, idx) => {
          const base = idx * 5;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::vector)`;
        })
        .join(', ');

      const params: unknown[] = batch.flatMap((c) => [
        c.repoFullName,
        c.filePath,
        c.chunkIndex,
        c.content,
        JSON.stringify(c.embedding),
      ]);

      await this.dataSource.query(
        `INSERT INTO code_chunks (repo_full_name, file_path, chunk_index, content, embedding)
         VALUES ${values}
         ON CONFLICT (repo_full_name, file_path, chunk_index)
         DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
        params,
      );
    }

    this.logger.log(`Upserted ${chunks.length} chunks`);
  }

  // ── Pure vector search ────────────────────────────────────────────────────

  async search(
    repoFullName: string,
    queryEmbedding: number[],
    limit = 10,
  ): Promise<SearchResult[]> {
    const rows: Array<{ file_path: string; content: string; similarity: number }> =
      await this.dataSource.query(
        `SELECT file_path, content,
                1 - (embedding <=> $1::vector) AS similarity
         FROM code_chunks
         WHERE repo_full_name = $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [JSON.stringify(queryEmbedding), repoFullName, limit],
      );

    return rows.map((r) => ({ filePath: r.file_path, content: r.content, similarity: r.similarity, source: 'vector' as const }));
  }

  // ── Hybrid search: vector + BM25 fused with RRF ──────────────────────────

  async hybridSearch(
    repoFullName: string,
    queryEmbedding: number[],
    queryText: string,
    limit = 10,
  ): Promise<SearchResult[]> {
    const candidateCount = Math.min(limit * 4, 40);

    // Run both searches in parallel
    const [vectorRows, bm25Rows] = await Promise.all([
      this.dataSource.query(
        `SELECT file_path, content,
                1 - (embedding <=> $1::vector) AS similarity
         FROM code_chunks
         WHERE repo_full_name = $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [JSON.stringify(queryEmbedding), repoFullName, candidateCount],
      ) as Promise<Array<{ file_path: string; content: string; similarity: number }>>,

      this.bm25Search(repoFullName, queryText, candidateCount),
    ]);

    const vectorResults: SearchResult[] = vectorRows.map((r) => ({
      filePath: r.file_path, content: r.content, similarity: r.similarity, source: 'vector' as const,
    }));

    const bm25Results: SearchResult[] = bm25Rows.map((r) => ({
      filePath: r.file_path, content: r.content, similarity: r.similarity, source: 'bm25' as const,
    }));

    const fused = this.reciprocalRankFusion(vectorResults, bm25Results, limit);

    this.logger.debug(
      `hybridSearch: vector=${vectorResults.length} bm25=${bm25Results.length} fused=${fused.length}`,
    );

    return fused;
  }

  // ── Direct file fetch (for stack trace hits) ──────────────────────────────

  async getChunksForFile(repoFullName: string, filePath: string): Promise<SearchResult[]> {
    const rows: Array<{ file_path: string; content: string }> = await this.dataSource.query(
      `SELECT file_path, content
       FROM code_chunks
       WHERE repo_full_name = $1
         AND (file_path = $2 OR file_path LIKE $3)
       ORDER BY chunk_index`,
      [repoFullName, filePath, `%${filePath}`],
    );

    return rows.map((r) => ({
      filePath: r.file_path,
      content: r.content,
      similarity: 1.0,
      source: 'vector' as const,
    }));
  }

  async deleteRepo(repoFullName: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM code_chunks WHERE repo_full_name = $1`, [repoFullName]);
    this.logger.log(`Deleted chunks for ${repoFullName}`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async bm25Search(
    repoFullName: string,
    queryText: string,
    limit: number,
  ): Promise<Array<{ file_path: string; content: string; similarity: number }>> {
    try {
      // Sanitise query — remove special tsquery characters
      const safe = queryText.replace(/[&|!():*<>'"]/g, ' ').trim();
      if (!safe) return [];

      return await this.dataSource.query(
        `SELECT file_path, content,
                ts_rank_cd(tsv, plainto_tsquery('english', $1)) AS similarity
         FROM code_chunks
         WHERE repo_full_name = $2
           AND tsv @@ plainto_tsquery('english', $1)
         ORDER BY similarity DESC
         LIMIT $3`,
        [safe, repoFullName, limit],
      );
    } catch {
      // tsv column may not exist on older DBs — fall back gracefully
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion — merges two ranked lists into one.
   * Score = Σ 1 / (k + rank) across all lists.
   * Deduplicates by filePath, keeping the highest-content version.
   */
  private reciprocalRankFusion(
    list1: SearchResult[],
    list2: SearchResult[],
    limit: number,
  ): SearchResult[] {
    const scores = new Map<string, number>();
    const content = new Map<string, SearchResult>();

    for (const [list] of [[list1], [list2]]) {
      (list as SearchResult[]).forEach((item, rank) => {
        const key = `${item.filePath}::${item.content.slice(0, 50)}`;
        scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + rank + 1));
        if (!content.has(key)) content.set(key, item);
      });
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, score]) => ({ ...content.get(key)!, similarity: score, source: 'hybrid' as const }));
  }
}
