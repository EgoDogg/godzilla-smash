// Godzilla/FXAdditiveControl — VERIFICATION-ONLY control, NOT shipped. Identical to GodzillaFXAdditive EXCEPT the
// blend line is plain "Blend One One" (= dst + src). Gate (a) renders the same FX with both blends and asserts the
// production "OneMinusDstColor One" self-limits toward white while this control overshoots/clips to flat neon —
// the single most important §9.5 Gate-2 distinction. Keep both literal so the difference is one greppable line.
Shader "Godzilla/FXAdditiveControl"
{
    Properties
    {
        _MainTex ("Soft Radial", 2D) = "white" {}
        _Color   ("Tint", Color) = (1,1,1,1)
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" "IgnoreProjector"="True" }

        Pass
        {
            Blend One One   // plain additive (the WRONG one) — overshoots to neon. Control only.
            ZWrite Off
            ZTest Always
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes { float4 positionOS : POSITION; float2 uv : TEXCOORD0; float4 color : COLOR; };
            struct Varyings  { float4 positionHCS : SV_POSITION; float2 uv : TEXCOORD0; float4 color : COLOR; };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            float4 _Color;
            float4 _MainTex_ST;

            Varyings vert (Attributes IN)
            {
                Varyings OUT;
                OUT.positionHCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.uv = TRANSFORM_TEX(IN.uv, _MainTex);
                OUT.color = IN.color;
                return OUT;
            }

            half4 frag (Varyings IN) : SV_Target
            {
                half4 tex = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, IN.uv);
                half  a   = tex.a * IN.color.a * _Color.a;
                half3 rgb = tex.rgb * IN.color.rgb * _Color.rgb;
                return half4(rgb * a, a);
            }
            ENDHLSL
        }
    }
}
