/** Positions use the available travel width, keeping scenery aligned during resizing. */
export function createGaryScene(random = Math.random) {
  const between = (min: number, max: number) => min + random() * (max - min);
  const stairStart = between(0.18, 0.4);
  const stairWidth = between(0.2, 0.28);
  const apple = between(Math.max(0.76, stairStart + stairWidth + 0.08), 0.9);
  const walk = between(24000, 38000);
  const idle = between(500, 2500);
  const eat = between(2800, 6000);
  const turn = between(600, 1600);
  const arrival = idle + apple * walk;
  const right = idle + walk + eat;
  const returnStart = right + turn;
  const home = returnStart + walk;
  const duration = home + between(600, 1800);
  const offset = (time: number) => time / duration;
  const position = (x: number) => `calc(${x * 100}% - ${x * 25}px)`;
  const frame = (time: number, x: number, height: number): Keyframe => ({
    offset: offset(time),
    left: position(x),
    bottom: `${height - 1}px`,
  });
  const terrain = [
    [-0.06, 0],
    [0, 4],
    [0.1275, 4],
    [0.1875, 8],
    [0.315, 8],
    [0.375, 12],
    [0.625, 12],
    [0.685, 8],
    [0.8125, 8],
    [0.8725, 4],
    [1, 4],
    [1.06, 0],
  ].map(([x, height]) => ({ x: stairStart + x! * stairWidth, height: height! }));
  const travel = [
    frame(0, 0, 0),
    frame(idle, 0, 0),
    ...terrain.map(({ x, height }) => frame(idle + x * walk, x, height)),
    frame(arrival, apple, 0),
    frame(arrival + eat, apple, 0),
    frame(right, 1, 0),
    frame(returnStart, 1, 0),
    ...[...terrain]
      .reverse()
      .map(({ x, height }) => frame(returnStart + (1 - x) * walk, x, height)),
    frame(home, 0, 0),
    frame(duration, 0, 0),
  ];
  const facing: Keyframe[] = [
    { offset: 0, transform: "scaleX(1)", easing: "steps(1, end)" },
    { offset: offset(right + turn / 2), transform: "scaleX(-1)" },
    { offset: 1, transform: "scaleX(-1)" },
  ];
  const chewing: Keyframe[] = [
    { offset: 0, rotate: "0deg" },
    { offset: offset(arrival), rotate: "0deg" },
  ];
  const bites = Math.floor(between(4, 7));
  for (let bite = 0; bite < bites * 2; bite++) {
    chewing.push({
      offset: offset(arrival + (eat * (bite + 1)) / (bites * 2 + 1)),
      rotate: bite % 2 ? "-3deg" : "7deg",
    });
  }
  chewing.push({ offset: offset(arrival + eat), rotate: "0deg" }, { offset: 1, rotate: "0deg" });
  const food: Keyframe[] = [
    { offset: 0, transform: "scale(1)", opacity: 1 },
    { offset: offset(arrival), transform: "scale(1)", opacity: 1 },
  ];
  for (let bite = 1; bite <= bites; bite++) {
    food.push({
      offset: offset(arrival + (eat * bite) / bites),
      transform: `scale(${1 - bite / bites})`,
      opacity: bite === bites ? 0 : 1,
    });
  }
  food.push({ offset: 1, transform: "scale(0)", opacity: 0 });
  return {
    duration,
    travel,
    facing,
    chewing,
    food,
    stairLeft: `calc(${stairStart * 100}% + ${12.5 - stairStart * 25}px)`,
    stairWidth: `calc(${stairWidth * 100}% - ${stairWidth * 25}px)`,
    appleLeft: `calc(${apple * 100}% + ${23 - apple * 25}px)`,
  };
}
