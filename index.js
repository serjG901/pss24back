const Koa = require("koa");
const cors = require("@koa/cors");
const bodyParser = require("koa-bodyparser");
const Router = require("koa-router");
const serve = require("koa-static");
const mount = require("koa-mount");
const send = require("koa-send");
const queryString = require("node:querystring");
require("dotenv").config();

const app = new Koa();
app.use(cors());

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.message;
    ctx.app.emit("error", err, ctx);
  }
});

// logger

app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.get("X-Response-Time");
  console.log(`${ctx.method} ${ctx.url} - ${rt}`);
});

// x-response-time

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.set("X-Response-Time", `${ms}ms`);
});

app.use(bodyParser());

const router = new Router();

const routes = {
  options: {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.TMDB_ACCESS}`,
      accept: "application/json",
    },
  },
  ways: {
    movieId: {
      proxy: "/movie/:id",
      original: "https://api.themoviedb.org/3/movie/",
    },
    discover: {
      proxy: "/discover/movie",
      original: "https://api.themoviedb.org/3//discover/movie",
    },
    genre: {
      proxy: "/genre/movie/list",
      original: "https://api.themoviedb.org/3/genre/movie/list?language=en",
    },
  },
};

router
  .get(routes.ways.movieId.proxy, async (ctx) => {
    const id = ctx.params.id;
    const res = await fetch(
      `${routes.ways.movieId.original}${id}?append_to_response=videos`,
      routes.options,
    );
    const data = await res.json();
    ctx.body = `${JSON.stringify(data, null, 4)}`;
  })
  .get(routes.ways.discover.proxy, async (ctx) => {
    const url = queryString.parse(ctx.request.href.split("?")[1]);
    const {
      page,
      withGenres: with_genres,
      primaryReleaseYear: primary_release_year,
      sortBy: sort_by,
      voteAverageLte,
      voteAverageGte,
    } = url;
    const voteAverageL = `${voteAverageLte ? "vote_average.lte=" + voteAverageLte : ""}`;
    const voteAverageG = `${voteAverageGte ? "vote_average.gte=" + voteAverageGte : ""}`;
    const voteAverage =
      voteAverageL && voteAverageG
        ? voteAverageL + "&" + voteAverageG + "&"
        : voteAverageL
          ? voteAverageL + "&"
          : voteAverageG + "&";
    const str = queryString.stringify({
      page,
      with_genres,
      primary_release_year,
      sort_by,
    });
    const res = await fetch(
      `${routes.ways.discover.original}?${str}&${voteAverage}`,
      routes.options,
    );
    const data = await res.json();
    ctx.body = `${JSON.stringify(data, null, 4)}`;
  })
  .get(routes.ways.genre.proxy, async (ctx) => {
    const res = await fetch(routes.ways.genre.original, routes.options);
    const data = await res.json();
    ctx.body = `${JSON.stringify(data, null, 4)}`;
  });

app.use(router.routes()).use(router.allowedMethods());

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`listening on port ${port}`));

class ForbidenError extends Error {
  constructor(message) {
    super(message);
    this.status = 403;
    Error.captureStackTrace(this, this.constructor);
  }
}
