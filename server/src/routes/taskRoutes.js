import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  archiveTask,
  createTask,
  createTaskLabel,
  createTimeEntry,
  deleteTask,
  deleteTaskLabel,
  getTaskById,
  getTasks,
  listTaskLabels,
  listTimeEntries,
  restoreTask,
  updateTask,
} from '../controllers/taskController.js';

const router = Router();

router.get('/', authenticate, getTasks);
router.get('/:id', authenticate, getTaskById);
router.post('/', authenticate, createTask);
router.put('/:id', authenticate, updateTask);
router.post('/:id/archive', authenticate, archiveTask);
router.post('/:id/restore', authenticate, restoreTask);
router.get('/:id/labels', authenticate, listTaskLabels);
router.post('/:id/labels', authenticate, createTaskLabel);
router.delete('/:id/labels/:labelId', authenticate, deleteTaskLabel);
router.get('/:id/time-entries', authenticate, listTimeEntries);
router.post('/:id/time-entries', authenticate, createTimeEntry);
router.delete('/:id', authenticate, deleteTask);

export default router;
