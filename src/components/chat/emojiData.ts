/**
 * Emoji data.
 *
 * Each entry is "<emoji> <keywords>", which keeps the table compact and makes
 * search a substring match with no index to build. Hand-rolled rather than
 * pulling in emoji-mart or emoji-picker-react — those ship 400 KB to 1 MB
 * including full Unicode datasets and sprite sheets, and the system font
 * already renders every one of these.
 */

export interface EmojiCategory {
  readonly name: string;
  readonly icon: string;
  readonly entries: readonly string[];
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    name: 'Smileys',
    icon: '😀',
    entries: [
      '😀 grin happy smile', '😃 smiley happy joy', '😄 laugh happy', '😁 beam grin',
      '😆 laugh satisfied', '😅 sweat laugh relief', '🤣 rofl rolling laugh', '😂 joy tears laugh',
      '🙂 slight smile', '🙃 upside down silly', '😉 wink', '😊 blush smile happy',
      '😇 innocent angel halo', '🥰 love hearts adore', '😍 heart eyes love', '🤩 star struck wow',
      '😘 kiss blow', '😗 kissing', '😚 kissing closed', '😙 kissing smile', '🥲 tear happy',
      '😋 yum tasty tongue', '😛 tongue out', '😜 wink tongue crazy', '🤪 zany goofy crazy',
      '😝 squint tongue', '🤗 hug hands', '🤭 oops giggle hand', '🤫 shh quiet secret',
      '🤔 think hmm consider', '🤐 zipper quiet', '🤨 raised eyebrow suspicious',
      '😐 neutral meh', '😑 expressionless', '😶 no mouth speechless', '😏 smirk sly',
      '😒 unamused annoyed', '🙄 eye roll', '😬 grimace awkward', '🤥 lying liar',
      '😌 relieved calm', '😔 pensive sad', '😪 sleepy tired', '🤤 drool',
      '😴 sleep zzz', '😷 mask sick', '🤒 thermometer ill', '🥱 yawn bored tired',
      '😵 dizzy dead', '🤯 mind blown explode', '🤠 cowboy', '🥳 party celebrate birthday',
      '😎 cool sunglasses', '🤓 nerd geek glasses', '🧐 monocle inspect', '😕 confused',
      '😟 worried', '🙁 frown sad', '😮 open mouth surprise', '😯 hushed surprised',
      '😲 astonished shocked', '😳 flushed embarrassed', '🥺 pleading puppy eyes beg',
      '😦 frowning open', '😧 anguished', '😨 fearful scared', '😰 anxious sweat',
      '😥 sad relieved', '😢 cry sad tear', '😭 sob crying loud', '😱 scream fear',
      '😖 confounded', '😣 persevere', '😞 disappointed sad', '😓 downcast sweat',
      '😩 weary tired', '😫 tired exhausted', '😤 triumph steam angry', '😡 angry mad rage',
      '🤬 cursing swearing', '💀 skull dead', '☠️ skull crossbones', '👻 ghost boo',
      '🤡 clown', '👽 alien', '🤖 robot', '💩 poop',
    ],
  },
  {
    name: 'Gestures',
    icon: '👋',
    entries: [
      '👋 wave hello bye', '🤚 raised hand', '✋ stop high five', '🖖 vulcan spock',
      '👌 ok perfect', '🤌 pinched italian', '🤏 pinch small', '✌️ peace victory',
      '🤞 fingers crossed luck', '🫰 finger heart money', '🤟 love you', '🤘 rock horns',
      '🤙 call me shaka', '👈 point left', '👉 point right', '👆 point up', '👇 point down',
      '☝️ index up', '👍 thumbs up yes good like', '👎 thumbs down no bad',
      '✊ fist raised', '👊 punch fist bump', '🤛 left fist', '🤜 right fist',
      '👏 clap applause', '🙌 raise hands praise', '🫶 heart hands love', '👐 open hands',
      '🤲 palms up', '🤝 handshake deal', '🙏 pray thanks please namaste', '💪 muscle strong flex',
      '🦾 mechanical arm', '💅 nails polish', '🤳 selfie', '💃 dance woman', '🕺 dance man',
      '🚶 walk', '🏃 run', '👀 eyes look watch', '🧠 brain', '👄 lips mouth',
    ],
  },
  {
    name: 'Hearts',
    icon: '❤️',
    entries: [
      '❤️ red heart love', '🧡 orange heart', '💛 yellow heart', '💚 green heart',
      '💙 blue heart', '💜 purple heart', '🖤 black heart', '🤍 white heart',
      '🤎 brown heart', '💔 broken heart sad', '❣️ heart exclamation', '💕 two hearts',
      '💞 revolving hearts', '💓 beating heart', '💗 growing heart', '💖 sparkling heart',
      '💘 heart arrow cupid', '💝 heart ribbon gift', '💟 heart decoration',
      '💯 hundred perfect score', '💢 anger symbol', '💥 collision boom', '💫 dizzy star',
      '💦 sweat drops water', '💨 dash wind fast', '💬 speech bubble', '💭 thought bubble',
      '💤 sleep zzz', '✨ sparkles shine', '⭐ star', '🌟 glowing star', '⚡ lightning bolt',
    ],
  },
  {
    name: 'Objects',
    icon: '🎉',
    entries: [
      '🎉 party popper celebrate', '🎊 confetti', '🎈 balloon', '🎂 birthday cake',
      '🍰 cake slice', '🧁 cupcake', '🍕 pizza', '🍔 burger', '🍟 fries', '🌮 taco',
      '🍜 noodles ramen', '🍣 sushi', '🍩 donut', '🍪 cookie', '☕ coffee tea',
      '🍵 green tea', '🧋 bubble tea boba', '🍺 beer', '🍻 cheers beers', '🥂 champagne cheers',
      '🍾 bottle celebrate', '🎮 game controller', '🎧 headphones music', '🎵 music note',
      '🎬 movie clapper film', '📷 camera photo', '💻 laptop computer', '📱 phone mobile',
      '⌚ watch', '🔋 battery', '💡 idea lightbulb', '🔑 key', '📚 books study',
      '✏️ pencil write', '📌 pin', '📎 paperclip', '🗓️ calendar date', '⏰ alarm clock time',
      '🎁 gift present', '🏆 trophy win', '⚽ football soccer', '🏀 basketball',
      '🏏 cricket bat', '🎯 target dart', '🎲 dice game', '🚗 car', '✈️ plane travel',
      '🏠 house home', '🌍 earth world', '💰 money bag', '💸 money flying',
    ],
  },
  {
    name: 'Nature',
    icon: '🌸',
    entries: [
      '🌸 cherry blossom flower', '🌺 hibiscus', '🌻 sunflower', '🌼 daisy flower',
      '🌷 tulip', '🌹 rose', '🥀 wilted flower', '🌱 seedling plant', '🌲 tree evergreen',
      '🌳 tree', '🌴 palm tree', '🌵 cactus', '🍀 clover luck', '🍁 maple leaf',
      '🍂 fallen leaves autumn', '🍃 leaf wind', '☀️ sun sunny', '🌤️ sun cloud',
      '⛅ partly cloudy', '🌧️ rain', '⛈️ storm thunder', '🌈 rainbow', '❄️ snowflake cold',
      '⛄ snowman', '🔥 fire lit hot', '💧 droplet water', '🌊 wave ocean sea',
      '🌙 moon night', '☄️ comet', '🐶 dog puppy', '🐱 cat kitten', '🐭 mouse',
      '🐹 hamster', '🐰 rabbit bunny', '🦊 fox', '🐻 bear', '🐼 panda', '🐨 koala',
      '🐯 tiger', '🦁 lion', '🐮 cow', '🐷 pig', '🐸 frog', '🐵 monkey', '🦄 unicorn',
      '🐝 bee', '🦋 butterfly', '🐢 turtle', '🐍 snake', '🐙 octopus', '🐬 dolphin',
    ],
  },
] as const;

/** Splits "😀 grin happy" into its emoji and its searchable keywords. */
export function parseEntry(entry: string): { emoji: string; keywords: string } {
  const spaceIndex = entry.indexOf(' ');
  return spaceIndex === -1
    ? { emoji: entry, keywords: '' }
    : { emoji: entry.slice(0, spaceIndex), keywords: entry.slice(spaceIndex + 1) };
}

export function searchEmoji(query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const results: string[] = [];
  for (const category of EMOJI_CATEGORIES) {
    for (const entry of category.entries) {
      const { emoji, keywords } = parseEntry(entry);
      if (keywords.includes(needle)) results.push(emoji);
    }
  }
  return results;
}
