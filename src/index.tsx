import { html } from "@elysiajs/html";
import { Elysia, Static, t } from "elysia";
import { ElysiaWS } from "elysia/dist/ws";

const MINES_COUNT = 8;
const BOARD_LENGTH = 8;
const BOARD_WIDTH = 8;
const TEST = false;

const createBoard = (w: number, l: number) =>
  Array.from({ length: w })
    .map(() => Array.from({ length: l })
      .map(() => ({
        flag: false,
        clicked: false,
        mine: false,
        nearby: 0
      })));

let board: Array<Array<{
  flag: boolean,
  clicked: boolean
  mine: boolean,
  nearby: number,
}>> = createBoard(BOARD_WIDTH, BOARD_LENGTH);

let gameState: "notStarted" | "started" | "win" | "loss" = "notStarted";

const placeMines = (avoid: Coords, minesPlaced = 0): void => {

  const width = board.length;
  const length = board[0].length;

  const [x, y] = [width, length].map(n => Math.floor(n * Math.random()));
  if (board[x][y].mine || (x === avoid.x && y === avoid.y)) return placeMines(avoid, minesPlaced);
  board[x][y].mine = true;

  return minesPlaced + 1 === MINES_COUNT ? undefined
    : placeMines(avoid, minesPlaced + 1);
};

const start = () => {
  gameState = "notStarted";
  board = createBoard(BOARD_WIDTH, BOARD_LENGTH);
};

start();

const Message = ({ swap }: { swap?: true }) => {

  const [message, classn] = (() => {
    switch (gameState) {
      case "notStarted":
        return ["Click to start...", ""];
      case "started":
        return ["Keep going!", ""];
      case "loss":
        return ["Uh oh!", "text-red-200"];
      case "win":
        return ["You win! :)", "text-green-200"];
    }
  })();

  return <span id="message" hx-swap-oob={swap ? "true" : undefined} class={classn}>{message}</span>;
}

const Space = ({ x, y, space: { mine, flag, clicked, nearby }, swap }: {
  x: number,
  y: number
  space: typeof board[number][number],
  swap?: true
}) => {

  // if (swap) console.log(x, y);

  const coords = `{
    "x": ${x},
    "y": ${y}
  }`;

  return <>
    <div
      id={`o${x}${y}`}
      class="flex items-center justify-center"
      hx-trigger="click[!ctrlKey]"
      hx-swap-oob={swap && "outerHTML"}
      hx-post={flag ? undefined : "/expose"}
      hx-vals={coords}
    >
      {clicked

        ? <button
          hx-trigger="click[ctrlKey]"
          class="w-12 h-12 hover:brightness-75 active:brightness-50"
        >
          {nearby !== 0 && nearby}
        </button>

        : <button
          hx-trigger="click[ctrlKey]"
          hx-post="/flag"
          hx-vals={coords}
          class="bg-white/10 w-12 h-12 hover:brightness-75 active:brightness-50"
          hx-swap="afterend"
        >
          {TEST && mine && "Mine"}
          {flag && "Flag"}
        </button>}
    </div >
  </>
};

const Page = () => <>
  <html>
    <head>
      <title>Minesweeper :)</title>
      <link rel="stylesheet" href="/public/css/output.css" />
      <script src="https://unpkg.com/htmx.org@2.0.1" />
      <script src="https://unpkg.com/htmx.org@1.9.12/dist/ext/ws.js" />
    </head>
    <body class="h-screen flex flex-col gap-4 items-center justify-center bg-black text-white">
      <div class="contents" hx-ext="ws" ws-connect="/ws">
        <Message />
        <Board />
        <button
          hx-post="/restart"
          hx-swap="none"
        >
          Restart
        </button>
      </div>
    </body>
  </html>
</>;

const Board = ({ swap }: { swap?: true }) =>
  <div id="board" class="grid grid-flow-col grid-rows-8 grid-cols-8 gap-2" hx-swap-oob={swap ? "true" : undefined}>
    {
      board.map((col, x) =>
        col.map((space, y) =>
          <Space {...{ x, y, space }} />
        )
      )
    }
  </div>;

const coordsBody = t.Object({
  x: t.Numeric(),
  y: t.Numeric()
})

type Coords = Static<typeof coordsBody>

const validCoord = ({ x, y }: Coords) =>
  x >= 0 &&
  x < BOARD_WIDTH &&
  y >= 0 &&
  y < BOARD_LENGTH;

let checked = new Set<`${number},${number}`>();
const expose = async (coords: Coords): Promise<string> => {

  if (gameState === "notStarted") {
    placeMines(coords);
    gameState = "started";
  }

  const x = +coords.x;
  const y = +coords.y;

  const space = board[x][y];

  checked = new Set<`${number},${number}`>();

  if (space.mine) {
    gameState = "loss";
    return <>
      <Message swap />
      {board
        .flatMap((col, x) => col
          .map(({ mine }, y) => !mine ? undefined : [x, y])
          .filter((mine): mine is [number, number] => mine !== undefined)
        )
        .map(([x, y]) =>
          <div id={`o${x}${y}`} hx-swap-oob="true" class="flex items-center justify-center">
            <span class="text-red-300">{'>:('}</span>
          </div>
        )
      }
    </>
  };

  return <>
    <Message swap />
    {exposeMore({ x, y }).map(props => <Space {...props} />)}
  </>;
}

const relativeCoords =
  Array
    .from({ length: 3 })
    .flatMap((_, x) =>
      Array
        .from({ length: 3 })
        .map((_, y) => [x - 1, y - 1] as const)
    )
    .filter(([x, y]) => !(x === 0 && y === 0));

const exposeMore = ({ x, y }: Coords): Array<Parameters<typeof Space>[0]> => {

  board[x][y].clicked = true;
  checked.add(`${x},${y}`);
  console.log(checked.size);

  const validRelativeCoords = relativeCoords
    .map(([i, j]) => [x + i, y + j])
    .filter(([x, y]) => validCoord({ x, y }));

  const count = validRelativeCoords
    .reduce(
      (acc, [x, y]) => acc + (board[x][y].mine ? 1 : 0),
      0
    );

  board[x][y].nearby = count;

  const props = { x, y, space: board[x][y], swap: true } satisfies Parameters<typeof Space>[0];

  if (count) return [props];

  const next = validRelativeCoords
    .filter(([x, y]) => !checked.has(`${x},${y}`));

  return !next.length ? [props] : [props, ...next.flatMap(([x, y]) => exposeMore({ x, y }))];
};

const flag = async ({ x, y }: Coords) => {
  board[x][y].flag = !board[x][y].flag;

  // Game ends when all mines have flags, and there are no false flags
  if (!board.some((col) => col.some(({ mine, flag }) => (mine && !flag) || (flag && !mine))))
    gameState = "win";

  return <>
    <Message swap />
    <Space {...{ x, y }} space={board[x][y]} swap />
  </>;
}

const restart = async () => {
  start();
  return <>
    <Message swap />
    <Board swap />
  </>;
}

const sockets: Map<string, ((data: unknown) => void)> = new Map();

// let publish: undefined | ((topic: string, data: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer, compress?: boolean | undefined) => number);
const app = new Elysia()
  .use(html())
  .get("/public/css/output.css", Bun.file("./src/output.css"))
  .get("/", () => Page())

  .ws("/ws", {
    open: (ws) => {
      sockets.set(ws.id, ws.send);
    },
    close: (ws) => {
      sockets.delete(ws.id);
    }
  })

  .guard({
    body: coordsBody
  }, app => app
    .post("/expose", ({ body }) => {
      expose(body)
        .then(m => Array.from(sockets).map(([_, send]) => send(m)))
    })
    .post("/flag", ({ body }) => { flag(body).then(m => Array.from(sockets).map(([_, send]) => send(m))) })
  )

  .post("/restart", () => { restart().then(m => Array.from(sockets).map(([_, send]) => send(m))) })

  .get("/*", () => Response.redirect("/"))
  .listen(3001, ({ hostname, port }) => {

    console.log(
      `HTMX-Minesweeper is running at ${hostname}:${port}`
    );
  });