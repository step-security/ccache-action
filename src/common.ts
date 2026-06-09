import path from "path";
import fs from "fs";
import {SummaryTableRow} from "@actions/core/lib/summary";
import * as core from "@actions/core";
import axios, { isAxiosError } from "axios";

export async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let repoPrivate: boolean | undefined;

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = eventData?.repository?.private;
  }

  const upstream = "hendrikmuhs/ccache-action";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info('')
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
      core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m')
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body: Record<string, string> = { action: action || "" };
  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 }
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
          `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      );
      core.error(
          `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}

type Version = [number,number,number];

export enum AgeUnit {
    Seconds = "s",
    Days = "d",
    Job = "job"
}

export function getJobDurationInSeconds() : number  {
    const startTime = Number.parseInt(core.getState("startTimestamp"));
    return Math.floor((Date.now() - startTime) * 0.001);
}

export function parseEvictAgeParameter(age: string): [number | null, AgeUnit] {
    const expr = /([0-9]+)([sd])|job/
    const result = age.match(expr);
    if (result) {
        if (result[0] !== "job") {
            return [Number.parseInt(result[1]), result[2] as AgeUnit];
        } else {
            return [null, AgeUnit.Job];
        }
    }

    throw new Error(`age parameter ${age} was not valid`);
}

/**
 * Parse the output of ccache --version to extract the semantic version components
 * @param ccacheOutput
 */
export function parseCCacheVersion(ccacheOutput: string) : Version | null {
    const firstLine = ccacheOutput.split("\n", 1)[0];
    // short version of https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
    const semver = /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/;
    const result = firstLine.match(semver);

    if (!result) {
        return null;
    }

    if (result.length != 4) {
        return null;
    }

    return [Number.parseInt(result[1]), Number.parseInt(result[2]), Number.parseInt(result[3])];
}

export function formatStatsAsTable(statsJson: string) : SummaryTableRow[] | null {
    const stats = JSON.parse(statsJson);
    if (stats === undefined) {
        return null;
    }
    // @ts-ignore
    const hits = stats["direct_cache_hit"] + stats["preprocessed_cache_hit"];
    const misses = stats["cache_miss"];
    const total = hits + misses;
    return [
        [{data: "Cache hits", header: true}, `${hits} / ${total}`, `${((hits / total) * 100).toPrecision(3)}%`]
    ];
}

export function cacheDir(ccacheVariant: string): string {
    const ghWorkSpace = process.env.GITHUB_WORKSPACE || "unreachable, make ncc happy";
    if (ccacheVariant === "ccache") {
        return process.env.CCACHE_DIR || path.join(ghWorkSpace, ".ccache");
    } else if (ccacheVariant === "sccache") {
        return process.env.SCCACHE_DIR || path.join(ghWorkSpace, ".sccache");
    }
    throw Error("Unknown ccache variant: " + ccacheVariant);
}
