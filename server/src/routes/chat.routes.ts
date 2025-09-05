import { Router } from 'express';
import { postChat } from '../controllers/chat.controller.js';
import { restaurantsSearchHandler } from '../controllers/restaurants.controller.js';
import { nluParseHandler } from '../controllers/nlu.controller.js';

export const chatRouter = Router();

chatRouter.post('/chat', postChat);
chatRouter.post('/restaurants/search', restaurantsSearchHandler);
chatRouter.post('/nlu/parse', nluParseHandler);


