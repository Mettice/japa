import type { Card, GameStats } from '../types/game';

export const destinations = [
  { id: 'canada', name: 'Canada', flag: '🇨🇦', route: 'Study route', detail: 'Build your application, meet your agent, then face the interview.', available: true },
  { id: 'uk', name: 'United Kingdom', flag: '🇬🇧', route: 'Work route', detail: 'A job offer, a sponsor, and a fresh start. This chapter is coming next.', available: false },
  { id: 'germany', name: 'Germany', flag: '🇩🇪', route: 'Study & skills', detail: 'Language preparation and a new career. This chapter is coming next.', available: false },
  { id: 'home', name: 'Build here', flag: '🏡', route: 'Your own business', detail: 'Turn street deliveries into a business and build a life at home.', available: true },
] as const;
export type DestinationId = typeof destinations[number]['id'];
export const DELIVERY_DISTANCE = 240;
export const DELIVERY_WAGES = 12;
export interface Life {
  version: 1; name: string; cityId: string; destination: DestinationId;
  chapter: number; attempts: number; stats: GameStats; helpedMama: boolean | null;
  trustedAgent: boolean | null; lastMessage: string;
}
export const missions = ['The first delivery', 'Family or the future?', 'Meet your agent', 'Your appointment'];
export const homeMissions = ['The first delivery', 'Family or the future?', 'Your first customer', 'Open for business'];
export function missionCards(life: Life): Card[] {
  const staying = life.destination === 'home';
  const make = (id: string, characterId: string, situation: string, left: string, right: string, le: Card['leftChoice']['effects'], re: Card['rightChoice']['effects']): Card => ({
    id, stageId: 'hustle', characterId, situation,
    leftChoice: { text: left, effects: le }, rightChoice: { text: right, effects: re },
  });
  const decks = [
    [],
    [make('mama_help', 'mama', 'Mama needs help with a repair at home. The money was meant for your next appointment.', 'Help Mama with the repair', 'Protect your savings', { money: -8, familyPressure: -15, morale: 8 }, { familyPressure: 10, papers: 5 }), make('print', 'boss', staying ? 'A customer asks for a price list. The printer closes soon.' : 'The print shop closes soon. Your application folder still needs copies.', 'Print and check everything', 'Use the cheaper rush service', { money: -5, papers: 12 }, { papers: 4, morale: -3 }), make('family_followup', 'mama', life.helpedMama === true ? 'Mama remembers your help. She has packed food for the road.' : 'Mama says: “I know you have plans. Just remember us when you get there.”', 'Stay and talk', 'Head to the appointment', { morale: 10, familyPressure: -6 }, { papers: 7, familyPressure: 4 })],
    [make('agent_trust', 'chidi', staying ? 'A new customer promises a big order, but wants you to pay a booking fee first.' : 'Your agent promises a guaranteed outcome if you pay an extra fee today.', 'Ask for written details', 'Pay and trust the promise', { papers: 10, morale: 2 }, { money: -10, papers: -3 }), make('check', 'boss', staying ? 'Your first customer wants to know when you can deliver.' : 'Your application has a missing detail. There is still time to check it.', 'Check it carefully', 'Send it as it is', { papers: 12, money: -3 }, { morale: 4, papers: -4 }), make('prepare', 'mama', 'Tomorrow is a big day. Your phone keeps buzzing while you try to prepare.', 'Practise and rest', 'Answer every message', { papers: 8, morale: 8 }, { familyPressure: -8, morale: -4 })],
    [make('appointment', 'boss', staying ? 'Opening day. Your first customer asks why they should choose your business.' : 'At the Canada study appointment, you are asked why this course fits your plans.', 'Explain your own plan', 'Repeat the agent’s script', { papers: 8, morale: 5 }, { papers: -6, morale: -4 }), make('funding', 'boss', staying ? 'A supplier asks how you will pay for your first orders.' : 'The officer asks how you prepared for the cost of studying.', 'Show your prepared records', 'Make a bigger promise', { papers: 8 }, { papers: -5, familyPressure: 5 }), make('finish', 'mama', staying ? 'Your first order is ready. Mama calls to wish you luck.' : 'Your appointment is over. Mama asks how it went. The decision is still to come.', 'Tell her the honest story', 'Say everything is sorted', { morale: 8, familyPressure: -5 }, { morale: 3, familyPressure: 8 })],
  ];
  if (life.chapter === 0) return [
    make('first_call', 'mama', 'Mama calls as you leave the customer: “Your boss said you finished your first delivery! Have you eaten? Tell me how it went.”', 'Sit down and tell her', 'Keep it short — I’m tired', { morale: 8, familyPressure: -8 }, { morale: 3, familyPressure: 4 }),
    make('save', 'mama', staying ? '“A little saved today could help you start that delivery business.” What will you do with your first wages?' : '“Canada is a big dream. Start small: save something and prepare your document folder.” What will you do with your first wages?', 'Save for the next step', 'Celebrate with friends', { papers: 10, morale: 3 }, { money: -5, morale: 10 }),
  ];
  return decks[Math.min(life.chapter, 3)];
}
export const LIFE_KEY = 'japa.life.v1';
export function readLife(): Life | null {
  try {
    const l = JSON.parse(localStorage.getItem(LIFE_KEY) ?? 'null');
    if (!l || l.version !== 1 || typeof l.name !== 'string' || !['lagos', 'douala', 'accra'].includes(l.cityId) || !['canada', 'home'].includes(l.destination) || !Number.isInteger(l.chapter) || l.chapter < 0 || l.chapter > 4 || !Number.isInteger(l.attempts) || l.attempts < 0 || typeof l.lastMessage !== 'string' || !l.stats || !Object.values(l.stats).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) || !['money', 'papers', 'morale', 'familyPressure'].every(k => typeof l.stats[k] === 'number')) return null;
    return l as Life;
  } catch { return null; }
}
