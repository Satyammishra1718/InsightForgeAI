import { Router } from 'express';
import multer from 'multer';
import {
  uploadPdf,
  ingestSnippets,
  ingestText,
  queryContext,
} from '../controllers/rag.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max PDF size
  },
});

const router = Router();

// POST /api/rag/upload-pdf (multipart/form-data with 'file' and 'sessionId')
router.post('/upload-pdf', upload.single('file'), uploadPdf);

// POST /api/rag/ingest-snippets ({ sessionId, snippets: [...] })
router.post('/ingest-snippets', ingestSnippets);

// POST /api/rag/ingest-text ({ sessionId, text, sourceName, title? })
router.post('/ingest-text', ingestText);

// POST /api/rag/query ({ sessionId, query, topK? })
router.post('/query', queryContext);

export default router;
