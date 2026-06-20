// Godzilla.Editor/BuildScript.cs — headless build entry points (plan §5.2/5.3/5.5, §9.6 D2).
// [MenuItem]-mirrored static methods so the SAME entry works from CI, Fastlane, and Claude-over-MCP:
//   Unity -quit -batchmode -nographics -projectPath <p> -executeMethod Godzilla.Editor.BuildScript.PerformAndroidBuild -logFile -
// Secrets (keystore pass, version) arrive via ENV, never on disk. Android = AAB + IL2CPP + ARM64 + API35+;
// iOS = Xcode project (IL2CPP forced) under Team 83T4PJ5UV6. This file COMPILES without the platform modules
// installed (the enums/APIs live in UnityEditor.dll); the actual build needs the module + a runner (P0-MCP-CI, G0).

using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Godzilla.Editor
{
    public static class BuildScript
    {
        const string AndroidOut = "Builds/Android/GodzillaSmash.aab";
        const string IosOut = "Builds/iOS";          // Unity emits an Xcode project here
        const string DefaultTeamId = "83T4PJ5UV6";   // Mike's Apple Team ID (overridable via APPLE_TEAM_ID)

        // Scenes enabled in Build Settings (File > Build Settings). Empty => caller fails loudly.
        static string[] EnabledScenes()
        {
            var list = new List<string>();
            foreach (var s in EditorBuildSettings.scenes)
                if (s.enabled) list.Add(s.path);
            return list.ToArray();
        }

        [MenuItem("Godzilla/Build/Android (AAB)")]
        public static void PerformAndroidBuild()
        {
            ApplyVersionFromEnv();
            EditorUserBuildSettings.buildAppBundle = true; // AAB, not APK (Play requirement)
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64; // 64-bit Play compliance
            // Auto resolves to the highest installed platform; with the current SDK that is API 35+ (Play gate).
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            ApplyAndroidKeystoreFromEnv();

            RunBuild(new BuildPlayerOptions
            {
                scenes = EnabledScenes(),
                locationPathName = AndroidOut,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.None,
            }, "Android AAB");
        }

        [MenuItem("Godzilla/Build/iOS (Xcode project)")]
        public static void PerformiOSBuild()
        {
            ApplyVersionFromEnv();
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.iOS, ScriptingImplementation.IL2CPP); // forced on iOS
            PlayerSettings.iOS.appleDeveloperTeamID = EnvOr("APPLE_TEAM_ID", DefaultTeamId);

            RunBuild(new BuildPlayerOptions
            {
                scenes = EnabledScenes(),
                locationPathName = IosOut,
                target = BuildTarget.iOS,
                targetGroup = BuildTargetGroup.iOS,
                options = BuildOptions.None,
            }, "iOS Xcode project");
        }

        static void RunBuild(BuildPlayerOptions opts, string label)
        {
            if (opts.scenes == null || opts.scenes.Length == 0)
            {
                Fail($"{label}: no enabled scenes in Build Settings — add the gameplay scene before building.");
                return;
            }
            var dir = Path.GetDirectoryName(Path.GetFullPath(opts.locationPathName));
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            BuildSummary summary = BuildPipeline.BuildPlayer(opts).summary;
            if (summary.result == BuildResult.Succeeded)
            {
                Debug.Log($"[BuildScript] {label} OK -> {summary.outputPath} ({summary.totalSize} bytes, {summary.totalTime}).");
                Exit(0);
            }
            else
            {
                Fail($"{label} FAILED: result={summary.result}, errors={summary.totalErrors}.");
            }
        }

        // CI passes secrets/version via env (Unity won't persist the keystore password on disk — plan §5.3).
        static void ApplyVersionFromEnv()
        {
            var v = Environment.GetEnvironmentVariable("BUILD_VERSION");
            if (!string.IsNullOrEmpty(v)) PlayerSettings.bundleVersion = v;
            var code = Environment.GetEnvironmentVariable("BUILD_NUMBER");
            if (!string.IsNullOrEmpty(code) && int.TryParse(code, out int n))
            {
                PlayerSettings.Android.bundleVersionCode = n;
                PlayerSettings.iOS.buildNumber = code;
            }
        }

        static void ApplyAndroidKeystoreFromEnv()
        {
            var ks = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PATH");
            var ksPass = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PASS");
            if (string.IsNullOrEmpty(ks) || string.IsNullOrEmpty(ksPass)) return; // debug keystore (won't publish; fine for an AAB smoke)
            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = ks;
            PlayerSettings.Android.keystorePass = ksPass;
            PlayerSettings.Android.keyaliasName = EnvOr("ANDROID_KEY_ALIAS", "godzilla");
            PlayerSettings.Android.keyaliasPass = EnvOr("ANDROID_KEY_ALIAS_PASS", ksPass);
        }

        static string EnvOr(string key, string fallback)
        {
            var v = Environment.GetEnvironmentVariable(key);
            return string.IsNullOrEmpty(v) ? fallback : v;
        }

        static void Fail(string msg)
        {
            Debug.LogError("[BuildScript] " + msg);
            Exit(1);
        }

        // Hard-exit with a code ONLY in batchmode/CI; from the Editor menu just log (don't kill the Editor).
        static void Exit(int code)
        {
            if (Application.isBatchMode) EditorApplication.Exit(code);
        }
    }
}
