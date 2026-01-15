import { Router } from 'express';
import { postChat } from '../controllers/chat.controller.js';
import { restaurantsSearchHandler } from '../controllers/restaurants.controller.js';
import { nluParseHandler } from '../controllers/nlu.controller.js';
import { conversationHandler } from '../controllers/conversation.controller.js';
import { foodDialogueHandler } from '../controllers/food.dialogue.controller.js';

export const chatRouter = Router();

chatRouter.post('/chat', postChat);
chatRouter.post('/restaurants/search', restaurantsSearchHandler);
chatRouter.post('/nlu/parse', nluParseHandler);
chatRouter.post('/chat/conversation', conversationHandler);
chatRouter.post('/food/dialogue', foodDialogueHandler);


