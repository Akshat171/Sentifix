import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { LlmProvider } from '../llm/llm.provider';
import { VectorStoreService } from './vector-store.service';

export interface IndexRepoPayload {
  repoFullName: string;
  branch?: string;
}

// File extensions considered as source code worth indexing
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.java',
  '.kt',
  '.rb',
  '.rs',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.php',
  '.swift',
  '.md',
  '.mdx',
]);

// Max characters per chunk; 1000 chars ≈ 250 tokens for most code
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

@Injectable()
export class IndexingJob {
  private readonly logger = new Logger(IndexingJob.name);
  private readonly octokit: Octokit;

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmProvider,
    private readonly vectorStore: VectorStoreService,
  ) {
    this.octokit = new Octokit({
      auth: config.get<string>('GITHUB_TOKEN'),
    });
  }

  async run(payload: IndexRepoPayload): Promise<void> {
    const [owner, repo] = payload.repoFullName.split('/');
    const branch = payload.branch ?? 'HEAD';
    this.logger.log(`Starting indexing for ${payload.repoFullName}@${branch}`);

    const files = await this.listCodeFiles(owner, repo, branch);
    this.logger.log(`Found ${files.length} code files to index`);

    let totalChunks = 0;
    const BATCH = 20; // files per embedding batch

    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const fileContents = await Promise.allSettled(
        batch.map((f) => this.fetchFileContent(owner, repo, f.sha)),
      );

      const chunks: Array<{
        repoFullName: string;
        filePath: string;
        chunkIndex: number;
        content: string;
        embedding: number[];
      }> = [];

      const textBatches: string[] = [];
      const metaBatches: Array<{ path: string; idx: number }> = [];

      for (let j = 0; j < batch.length; j++) {
        const result = fileContents[j];
        if (result.status === 'rejected') continue;
        const content = result.value;
        const fileChunks = this.chunkText(content);
        for (let k = 0; k < fileChunks.length; k++) {
          textBatches.push(`File: ${batch[j].path}\n\n${fileChunks[k]}`);
          metaBatches.push({ path: batch[j].path, idx: k });
        }
      }

      if (textBatches.length === 0) continue;

      const embeddings = await this.llm.embedBatch(textBatches);

      for (let m = 0; m < metaBatches.length; m++) {
        chunks.push({
          repoFullName: payload.repoFullName,
          filePath: metaBatches[m].path,
          chunkIndex: metaBatches[m].idx,
          content: textBatches[m],
          embedding: embeddings[m],
        });
      }

      await this.vectorStore.upsertChunks(chunks);
      totalChunks += chunks.length;
      this.logger.log(
        `Indexed batch ${i / BATCH + 1}: ${chunks.length} chunks (total: ${totalChunks})`,
      );
    }

    this.logger.log(`Finished indexing ${payload.repoFullName}: ${totalChunks} chunks total`);
  }

  private async listCodeFiles(
    owner: string,
    repo: string,
    treeSha: string,
  ): Promise<Array<{ path: string; sha: string }>> {
    const { data } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: '1',
    });

    return (data.tree ?? [])
      .filter((node) => {
        if (node.type !== 'blob' || !node.path || !node.sha) return false;
        const ext = node.path.slice(node.path.lastIndexOf('.'));
        return CODE_EXTENSIONS.has(ext);
      })
      .map((node) => ({ path: node.path!, sha: node.sha! }));
  }

  private async fetchFileContent(owner: string, repo: string, fileSha: string): Promise<string> {
    const { data } = await this.octokit.git.getBlob({ owner, repo, file_sha: fileSha });
    return Buffer.from(data.content, data.encoding as BufferEncoding).toString('utf-8');
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + CHUNK_SIZE));
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks.filter((c) => c.trim().length > 0);
  }
}
