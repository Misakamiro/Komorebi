FFmpeg 64-bit static Windows build from www.gyan.dev

Version: 2026-04-16-git-5abc240a27-full_build-www.gyan.dev

License: GPL v3

Source Code: https://github.com/FFmpeg/FFmpeg/commit/5abc240a27

External Assets
frei0r plugins:   https://www.gyan.dev/ffmpeg/builds/ffmpeg-frei0r-plugins
lensfun database: https://www.gyan.dev/ffmpeg/builds/ffmpeg-lensfun-db
whisper models:   https://huggingface.co/ggerganov/whisper.cpp/tree/main

git-full build configuration: 

ARCH                      x86 (generic)
big-endian                no
runtime cpu detection     yes
standalone assembly       yes
x86 assembler             nasm
MMX enabled               yes
MMXEXT enabled            yes
SSE enabled               yes
SSSE3 enabled             yes
AESNI enabled             yes
CLMUL enabled             yes
AVX enabled               yes
AVX2 enabled              yes
AVX-512 enabled           yes
AVX-512ICL enabled        yes
XOP enabled               yes
FMA3 enabled              yes
FMA4 enabled              yes
i686 features enabled     yes
CMOV is fast              yes
EBX available             yes
EBP available             yes
debug symbols             yes
strip symbols             yes
optimize for size         no
optimizations             yes
static                    yes
shared                    no
network support           yes
threading support         pthreads
safe bitstream reader     yes
texi2html enabled         no
perl enabled              yes
pod2man enabled           yes
makeinfo enabled          yes
makeinfo supports HTML    yes
experimental features     yes
xmllint enabled           yes

External libraries:
avisynth                libgsm                  libsvtav1
bzlib                   libharfbuzz             libsvtjpegxs
cairo                   libilbc                 libtheora
chromaprint             libjxl                  libtwolame
frei0r                  liblc3                  libuavs3d
gmp                     liblensfun              libvidstab
gnutls                  libmodplug              libvmaf
iconv                   libmp3lame              libvo_amrwbenc
ladspa                  libmysofa               libvorbis
lcms2                   liboapv                 libvpx
libaom                  libopencore_amrnb       libvvenc
libaribb24              libopencore_amrwb       libwebp
libaribcaption          libopenjpeg             libx264
libass                  libopenmpt              libx265
libbluray               libopus                 libxavs2
libbs2b                 libplacebo              libxevd
libcaca                 libqrencode             libxeve
libcdio                 libquirc                libxml2
libcodec2               librav1e                libxvid
libdav1d                librist                 libzimg
libdavs2                librubberband           libzmq
libdvdnav               libshaderc              libzvbi
libdvdread              libshine                lzma
libflite                libsnappy               mediafoundation
libfontconfig           libsoxr                 openal
libfreetype             libspeex                sdl2
libfribidi              libsrt                  whisper
libgme                  libssh                  zlib

External libraries providing hardware acceleration:
amf                     d3d12va                 nvdec
cuda                    dxva2                   nvenc
cuda_llvm               ffnvcodec               opencl
cuvid                   libmfx                  vaapi
d3d11va                 libvpl                  vulkan

Libraries:
avcodec                 avformat                swscale
avdevice                avutil
avfilter                swresample

Programs:
ffmpeg                  ffplay                  ffprobe

Enabled decoders:
aac                     fmvc                    pcm_u32be
aac_fixed               fourxm                  pcm_u32le
aac_latm                fraps                   pcm_u8
aasc                    frwu                    pcm_vidc
ac3                     ftr                     pcx
ac3_fixed               g2m                     pdv
acelp_kelvin            g723_1                  pfm
adpcm_4xm               g728                    pgm
adpcm_adx               g729                    pgmyuv
adpcm_afc               gdv                     pgssub
adpcm_agm               gem                     pgx
adpcm_aica              gif                     phm
adpcm_argo              gremlin_dpcm            photocd
adpcm_circus            gsm                     pictor
adpcm_ct                gsm_ms                  pixlet
adpcm_dtk               h261                    pjs
adpcm_ea                h263                    png
adpcm_ea_maxis_xa       h263i                   ppm
adpcm_ea_r1             h263p                   prores
adpcm_ea_r2             h264                    prores_raw
adpcm_ea_r3             h264_amf                prosumer
adpcm_ea_xas            h264_cuvid              psd
adpcm_g722              h264_qsv                ptx
adpcm_g726              hap                     qcelp
adpcm_g726le            hca                     qdm2
adpcm_ima_acorn         hcom                    qdmc
adpcm_ima_alp           hdr                     qdraw
adpcm_ima_amv           hevc                    qoa
adpcm_ima_apc           hevc_amf                qoi
adpcm_ima_apm           hevc_cuvid              qpeg
adpcm_ima_cunning       hevc_qsv                qtrle
adpcm_ima_dat4          hnm4_video              r10k
adpcm_ima_dk3           hq_hqa                  r210
adpcm_ima_dk4           hqx                     ra_144
adpcm_ima_ea_eacs       huffyuv                 ra_288
adpcm_ima_ea_sead       hymt                    ralf
adpcm_ima_escape        iac                     rasc
adpcm_ima_hvqm2         idcin                   rawvideo
adpcm_ima_hvqm4         idf                     realtext
adpcm_ima_iss           iff_ilbm                rka
adpcm_ima_magix         ilbc                    rl2
adpcm_ima_moflex        imc                     roq
adpcm_ima_mtf           imm4                    roq_dpcm
adpcm_ima_oki           imm5                    rpza
adpcm_ima_pda           indeo2                  rscc
adpcm_ima_qt            indeo3                  rtv1
adpcm_ima_rad           indeo4                  rv10
adpcm_ima_smjpeg        indeo5                  rv20
adpcm_ima_ssi           interplay_acm           rv30
adpcm_ima_wav           interplay_dpcm          rv40
adpcm_ima_ws            interplay_video         rv60
adpcm_ima_xbox          ipu                     s302m
adpcm_ms                jacosub                 sami
adpcm_mtaf              jpeg2000                sanm
adpcm_n64               jpegls                  sbc
adpcm_psx               jv                      scpr
adpcm_psxc              kgv1                    screenpresso
adpcm_sanyo             kmvc                    sdx2_dpcm
adpcm_sbpro_2           lagarith                sga
adpcm_sbpro_3           lead                    sgi
adpcm_sbpro_4           libaom_av1              sgirle
adpcm_swf               libaribb24              sheervideo
adpcm_thp               libaribcaption          shorten
adpcm_thp_le            libcodec2               simbiosis_imx
adpcm_vima              libdav1d                sipr
adpcm_xa                libdavs2                siren
adpcm_xmd               libgsm                  smackaud
adpcm_yamaha            libgsm_ms               smacker
adpcm_zork              libilbc                 smc
agm                     libjxl                  smvjpeg
ahx                     libjxl_anim             snow
aic                     liblc3                  sol_dpcm
alac                    libopencore_amrnb       sonic
alias_pix               libopencore_amrwb       sp5x
als                     libopus                 speedhq
amrnb                   libspeex                speex
amrwb                   libsvtjpegxs            srgc
amv                     libuavs3d               srt
anm                     libvorbis               ssa
ansi                    libvpx_vp8              stl
anull                   libvpx_vp9              subrip
apac                    libxevd                 subviewer
ape                     libzvbi_teletext        subviewer1
apng                    loco                    sunrast
aptx                    lscr                    svq1
aptx_hd                 m101                    svq3
apv                     mace3                   tak
arbc                    mace6                   targa
argo                    magicyuv                targa_y216
ass                     mdec                    tdsc
asv1                    media100                text
asv2                    metasound               theora
atrac1                  microdvd                thp
atrac3                  mimic                   tiertexseqvideo
atrac3al                misc4                   tiff
atrac3p                 mjpeg                   tmv
atrac3pal               mjpeg_cuvid             truehd
atrac9                  mjpeg_qsv               truemotion1
aura                    mjpegb                  truemotion2
aura2                   mlp                     truemotion2rt
av1                     mmvideo                 truespeech
av1_amf                 mobiclip                tscc
av1_cuvid               motionpixels            tscc2
av1_qsv                 movtext                 tta
avrn                    mp1                     twinvq
avrp                    mp1float                txd
avs                     mp2                     ulti
avui                    mp2float                utvideo
bethsoftvid             mp3                     v210
bfi                     mp3adu                  v210x
bink                    mp3adufloat             v308
binkaudio_dct           mp3float                v408
binkaudio_rdft          mp3on4                  v410
bintext                 mp3on4float             vb
bitpacked               mpc7                    vble
bmp                     mpc8                    vbn
bmv_audio               mpeg1_cuvid             vc1
bmv_video               mpeg1video              vc1_cuvid
bonk                    mpeg2_cuvid             vc1_qsv
brender_pix             mpeg2_qsv               vc1image
c93                     mpeg2video              vcr1
cavs                    mpeg4                   vmdaudio
cbd2_dpcm               mpeg4_cuvid             vmdvideo
ccaption                mpegvideo               vmix
cdgraphics              mpl2                    vmnc
cdtoons                 msa1                    vnull
cdxl                    mscc                    vorbis
cfhd                    msmpeg4v1               vp3
cinepak                 msmpeg4v2               vp4
clearvideo              msmpeg4v3               vp5
cljr                    msnsiren                vp6
cllc                    msp2                    vp6a
comfortnoise            msrle                   vp6f
cook                    mss1                    vp7
cpia                    mss2                    vp8
cri                     msvideo1                vp8_cuvid
cscd                    mszh                    vp8_qsv
cyuv                    mts2                    vp9
dca                     mv30                    vp9_amf
dds                     mvc1                    vp9_cuvid
derf_dpcm               mvc2                    vp9_qsv
dfa                     mvdv                    vplayer
dfpwm                   mvha                    vqa
dirac                   mwsc                    vqc
dnxhd                   mxpeg                   vvc
dolby_e                 nellymoser              vvc_qsv
dpx                     notchlc                 wady_dpcm
dsd_lsbf                nuv                     wavarc
dsd_lsbf_planar         on2avc                  wavpack
dsd_msbf                opus                    wbmp
dsd_msbf_planar         osq                     wcmv
dsicinaudio             paf_audio               webp
dsicinvideo             paf_video               webvtt
dss_sp                  pam                     wmalossless
dst                     pbm                     wmapro
dvaudio                 pcm_alaw                wmav1
dvbsub                  pcm_bluray              wmav2
dvdsub                  pcm_dvd                 wmavoice
dvvideo                 pcm_f16le               wmv1
dxa                     pcm_f24le               wmv2
dxtory                  pcm_f32be               wmv3
dxv                     pcm_f32le               wmv3image
eac3                    pcm_f64be               wnv1
eacmv                   pcm_f64le               wrapped_avframe
eamad                   pcm_lxf                 ws_snd1
eatgq                   pcm_mulaw               xan_dpcm
eatgv                   pcm_s16be               xan_wc3
eatqi                   pcm_s16be_planar        xan_wc4
eightbps                pcm_s16le               xbin
eightsvx_exp            pcm_s16le_planar        xbm
eightsvx_fib            pcm_s24be               xface
escape124               pcm_s24daud             xl
escape130               pcm_s24le               xma1
evrc                    pcm_s24le_planar        xma2
exr                     pcm_s32be               xpm
fastaudio               pcm_s32le               xsub
ffv1                    pcm_s32le_planar        xwd
ffvhuff                 pcm_s64be               y41p
ffwavesynth             pcm_s64le               ylc
fic                     pcm_s8                  yop
fits                    pcm_s8_planar           yuv4
flac                    pcm_sga                 zero12v
flashsv                 pcm_u16be               zerocodec
flashsv2                pcm_u16le               zlib
flic                    pcm_u24be               zmbv
flv                     pcm_u24le

Enabled encoders:
a64multi                hevc_nvenc              pcm_s64be
a64multi5               hevc_qsv                pcm_s64le
aac                     hevc_vaapi              pcm_s8
aac_mf                  hevc_vulkan             pcm_s8_planar
ac3                     huffyuv                 pcm_u16be
ac3_fixed               jpeg2000                pcm_u16le
ac3_mf                  jpegls                  pcm_u24be
adpcm_adx               libaom_av1              pcm_u24le
adpcm_argo              libcodec2               pcm_u32be
adpcm_g722              libgsm                  pcm_u32le
adpcm_g726              libgsm_ms               pcm_u8
adpcm_g726le            libilbc                 pcm_vidc
adpcm_ima_alp           libjxl                  pcx
adpcm_ima_amv           libjxl_anim             pdv
adpcm_ima_apm           liblc3                  pfm
adpcm_ima_qt            libmp3lame              pgm
adpcm_ima_ssi           liboapv                 pgmyuv
adpcm_ima_wav           libopencore_amrnb       phm
adpcm_ima_ws            libopenjpeg             png
adpcm_ms                libopus                 ppm
adpcm_swf               librav1e                prores
adpcm_yamaha            libshine                prores_aw
alac                    libspeex                prores_ks
alias_pix               libsvtav1               prores_ks_vulkan
amv                     libsvtjpegxs            qoi
anull                   libtheora               qtrle
apng                    libtwolame              r10k
aptx                    libvo_amrwbenc          r210
aptx_hd                 libvorbis               ra_144
ass                     libvpx_vp8              rawvideo
asv1                    libvpx_vp9              roq
asv2                    libvvenc                roq_dpcm
av1_amf                 libwebp                 rpza
av1_d3d12va             libwebp_anim            rv10
av1_mf                  libx264                 rv20
av1_nvenc               libx264rgb              s302m
av1_qsv                 libx265                 sbc
av1_vaapi               libxavs2                sgi
av1_vulkan              libxeve                 smc
avrp                    libxvid                 snow
avui                    ljpeg                   speedhq
bitpacked               magicyuv                srt
bmp                     mjpeg                   ssa
cfhd                    mjpeg_qsv               subrip
cinepak                 mjpeg_vaapi             sunrast
cljr                    mlp                     svq1
comfortnoise            movtext                 targa
dca                     mp2                     text
dfpwm                   mp2fixed                tiff
dnxhd                   mp3_mf                  truehd
dpx                     mpeg1video              tta
dvbsub                  mpeg2_qsv               ttml
dvdsub                  mpeg2_vaapi             utvideo
dvvideo                 mpeg2video              v210
dxv                     mpeg4                   v308
eac3                    msmpeg4v2               v408
exr                     msmpeg4v3               v410
ffv1                    msrle                   vbn
ffv1_vulkan             msvideo1                vc2
ffvhuff                 nellymoser              vnull
fits                    opus                    vorbis
flac                    pam                     vp8_vaapi
flashsv                 pbm                     vp9_qsv
flashsv2                pcm_alaw                vp9_vaapi
flv                     pcm_bluray              wavpack
g723_1                  pcm_dvd                 wbmp
gif                     pcm_f32be               webvtt
h261                    pcm_f32le               wmav1
h263                    pcm_f64be               wmav2
h263p                   pcm_f64le               wmv1
h264_amf                pcm_mulaw               wmv2
h264_d3d12va            pcm_s16be               wrapped_avframe
h264_mf                 pcm_s16be_planar        xbm
h264_nvenc              pcm_s16le               xface
h264_qsv                pcm_s16le_planar        xsub
h264_vaapi              pcm_s24be               xwd
h264_vulkan             pcm_s24daud             y41p
hap                     pcm_s24le               yuv4
hdr                     pcm_s24le_planar        zlib
hevc_amf                pcm_s32be               zmbv
hevc_d3d12va            pcm_s32le
hevc_mf                 pcm_s32le_planar

Enabled hwaccels:
av1_d3d11va             hevc_dxva2              vc1_dxva2
av1_d3d11va2            hevc_nvdec              vc1_nvdec
av1_d3d12va             hevc_vaapi              vc1_vaapi
av1_dxva2               hevc_vulkan             vp8_nvdec
av1_nvdec               mjpeg_nvdec             vp8_vaapi
av1_vaapi               mjpeg_vaapi             vp9_d3d11va
av1_vulkan              mpeg1_nvdec             vp9_d3d11va2
dpx_vulkan              mpeg2_d3d11va           vp9_d3d12va
ffv1_vulkan             mpeg2_d3d11va2          vp9_dxva2
h263_vaapi              mpeg2_d3d12va           vp9_nvdec
h264_d3d11va            mpeg2_dxva2             vp9_vaapi
h264_d3d11va2           mpeg2_nvdec             vp9_vulkan
h264_d3d12va            mpeg2_vaapi             vvc_vaapi
h264_dxva2              mpeg4_nvdec             wmv3_d3d11va
h264_nvdec              mpeg4_vaapi             wmv3_d3d11va2
h264_vaapi              prores_raw_vulkan       wmv3_d3d12va
h264_vulkan             prores_vulkan           wmv3_dxva2
hevc_d3d11va            vc1_d3d11va             wmv3_nvdec
hevc_d3d11va2           vc1_d3d11va2            wmv3_vaapi
hevc_d3d12va            vc1_d3d12va

Enabled parsers:
aac                     dvdsub                  mpegaudio
aac_latm                evc                     mpegvideo
ac3                     ffv1                    opus
adx                     flac                    png
ahx                     ftr                     pnm
amr                     g723_1                  prores
apv                     g729                    prores_raw
av1                     gif                     qoi
avs2                    gsm                     rv34
avs3                    h261                    sbc
bmp                     h263                    sipr
cavsvideo               h264                    tak
cook                    hdr                     vc1
cri                     hevc                    vorbis
dca                     ipu                     vp3
dirac                   jpeg2000                vp8
dnxhd                   jpegxl                  vp9
dnxuc                   jpegxs                  vvc
dolby_e                 lcevc                   webp
dpx                     misc4                   xbm
dvaudio                 mjpeg                   xma
dvbsub                  mlp                     xwd
dvd_nav                 mpeg4video

Enabled demuxers:
aa                      ico                     pcm_f64be
aac                     idcin                   pcm_f64le
aax                     idf                     pcm_mulaw
ac3                     iff                     pcm_s16be
ac4                     ifv                     pcm_s16le
ace                     ilbc                    pcm_s24be
acm                     image2                  pcm_s24le
act                     image2_alias_pix        pcm_s32be
adf                     image2_brender_pix      pcm_s32le
adp                     image2pipe              pcm_s8
ads                     image_bmp_pipe          pcm_u16be
adx                     image_cri_pipe          pcm_u16le
aea                     image_dds_pipe          pcm_u24be
afc                     image_dpx_pipe          pcm_u24le
aiff                    image_exr_pipe          pcm_u32be
aix                     image_gem_pipe          pcm_u32le
alp                     image_gif_pipe          pcm_u8
amr                     image_hdr_pipe          pcm_vidc
amrnb                   image_j2k_pipe          pdv
amrwb                   image_jpeg_pipe         pjs
anm                     image_jpegls_pipe       pmp
apac                    image_jpegxl_pipe       pp_bnk
apc                     image_jpegxs_pipe       pva
ape                     image_pam_pipe          pvf
apm                     image_pbm_pipe          qcp
apng                    image_pcx_pipe          qoa
aptx                    image_pfm_pipe          r3d
aptx_hd                 image_pgm_pipe          rawvideo
apv                     image_pgmyuv_pipe       rcwt
aqtitle                 image_pgx_pipe          realtext
argo_asf                image_phm_pipe          redspark
argo_brp                image_photocd_pipe      rka
argo_cvg                image_pictor_pipe       rl2
asf                     image_png_pipe          rm
asf_o                   image_ppm_pipe          roq
ass                     image_psd_pipe          rpl
ast                     image_qdraw_pipe        rsd
au                      image_qoi_pipe          rso
av1                     image_sgi_pipe          rtp
avi                     image_sunrast_pipe      rtsp
avisynth                image_svg_pipe          s337m
avr                     image_tiff_pipe         sami
avs                     image_vbn_pipe          sap
avs2                    image_webp_pipe         sbc
avs3                    image_xbm_pipe          sbg
bethsoftvid             image_xpm_pipe          scc
bfi                     image_xwd_pipe          scd
bfstm                   imf                     sdns
bink                    ingenient               sdp
binka                   ipmovie                 sdr2
bintext                 ipu                     sds
bit                     ircam                   sdx
bitpacked               iss                     segafilm
bmv                     iv8                     ser
boa                     ivf                     sga
bonk                    ivr                     shorten
brstm                   jacosub                 siff
c93                     jpegxl_anim             simbiosis_imx
caf                     jv                      sln
cavsvideo               kux                     smacker
cdg                     kvag                    smjpeg
cdxl                    laf                     smush
cine                    lc3                     sol
codec2                  libgme                  sox
codec2raw               libmodplug              spdif
concat                  libopenmpt              srt
dash                    live_flv                stl
data                    lmlm4                   str
daud                    loas                    subviewer
dcstr                   lrc                     subviewer1
derf                    luodat                  sup
dfa                     lvf                     svag
dfpwm                   lxf                     svs
dhav                    m4v                     swf
dirac                   matroska                tak
dnxhd                   mca                     tedcaptions
dsf                     mcc                     thp
dsicin                  mgsts                   threedostr
dss                     microdvd                tiertexseq
dts                     mjpeg                   tmv
dtshd                   mjpeg_2000              truehd
dv                      mlp                     tta
dvbsub                  mlv                     tty
dvbtxt                  mm                      txd
dvdvideo                mmf                     ty
dxa                     mods                    usm
ea                      moflex                  v210
ea_cdata                mov                     v210x
eac3                    mp3                     vag
epaf                    mpc                     vc1
evc                     mpc8                    vc1t
ffmetadata              mpegps                  vividas
filmstrip               mpegts                  vivo
fits                    mpegtsraw               vmd
flac                    mpegvideo               vobsub
flic                    mpjpeg                  voc
flv                     mpl2                    vpk
fourxm                  mpsub                   vplayer
frm                     msf                     vqf
fsb                     msnwc_tcp               vvc
fwse                    msp                     w64
g722                    mtaf                    wady
g723_1                  mtv                     wav
g726                    musx                    wavarc
g726le                  mv                      wc3
g728                    mvi                     webm_dash_manifest
g729                    mxf                     webvtt
gdv                     mxg                     wsaud
genh                    nc                      wsd
gif                     nistsphere              wsvqa
gsm                     nsp                     wtv
gxf                     nsv                     wv
h261                    nut                     wve
h263                    nuv                     xa
h264                    obu                     xbin
hca                     ogg                     xmd
hcom                    oma                     xmv
hevc                    osq                     xvag
hls                     paf                     xwma
hnm                     pcm_alaw                yop
hxvs                    pcm_f32be               yuv4mpegpipe
iamf                    pcm_f32le

Enabled muxers:
a64                     h263                    pcm_s24be
ac3                     h264                    pcm_s24le
ac4                     hash                    pcm_s32be
adts                    hds                     pcm_s32le
adx                     hevc                    pcm_s8
aea                     hls                     pcm_u16be
aiff                    iamf                    pcm_u16le
alp                     ico                     pcm_u24be
amr                     ilbc                    pcm_u24le
amv                     image2                  pcm_u32be
apm                     image2pipe              pcm_u32le
apng                    ipod                    pcm_u8
aptx                    ircam                   pcm_vidc
aptx_hd                 ismv                    pdv
apv                     ivf                     psp
argo_asf                jacosub                 rawvideo
argo_cvg                kvag                    rcwt
asf                     latm                    rm
asf_stream              lc3                     roq
ass                     lrc                     rso
ast                     m4v                     rtp
au                      matroska                rtp_mpegts
avi                     matroska_audio          rtsp
avif                    mcc                     sap
avm2                    md5                     sbc
avs2                    microdvd                scc
avs3                    mjpeg                   segafilm
bit                     mkvtimestamp_v2         segment
caf                     mlp                     smjpeg
cavsvideo               mmf                     smoothstreaming
chromaprint             mov                     sox
codec2                  mp2                     spdif
codec2raw               mp3                     spx
crc                     mp4                     srt
dash                    mpeg1system             stream_segment
data                    mpeg1vcd                streamhash
daud                    mpeg1video              sup
dfpwm                   mpeg2dvd                swf
dirac                   mpeg2svcd               tee
dnxhd                   mpeg2video              tg2
dts                     mpeg2vob                tgp
dv                      mpegts                  truehd
eac3                    mpjpeg                  tta
evc                     mxf                     ttml
f4v                     mxf_d10                 uncodedframecrc
ffmetadata              mxf_opatom              vc1
fifo                    null                    vc1t
filmstrip               nut                     voc
fits                    obu                     vvc
flac                    oga                     w64
flv                     ogg                     wav
framecrc                ogv                     webm
framehash               oma                     webm_chunk
framemd5                opus                    webm_dash_manifest
g722                    pcm_alaw                webp
g723_1                  pcm_f32be               webvtt
g726                    pcm_f32le               whip
g726le                  pcm_f64be               wsaud
gif                     pcm_f64le               wtv
gsm                     pcm_mulaw               wv
gxf                     pcm_s16be               yuv4mpegpipe
h261                    pcm_s16le

Enabled protocols:
async                   http                    rtmp
bluray                  httpproxy               rtmpe
cache                   https                   rtmps
concat                  icecast                 rtmpt
concatf                 ipfs_gateway            rtmpte
crypto                  ipns_gateway            rtmpts
data                    librist                 rtp
dtls                    libsrt                  srtp
fd                      libssh                  subfile
ffrtmpcrypt             libzmq                  tcp
ffrtmphttp              md5                     tee
file                    mmsh                    tls
ftp                     mmst                    udp
gopher                  pipe                    udplite
gophers                 prompeg

Enabled filters:
a3dscope                decimate                perlin
aap                     deconvolve              perms
abench                  dedot                   perspective
abitscope               deesser                 phase
acompressor             deflate                 photosensitivity
acontrast               deflicker               pixdesctest
acopy                   deinterlace_d3d12       pixelize
acrossfade              deinterlace_qsv         pixscope
acrossover              deinterlace_vaapi       pp7
acrusher                dejudder                premultiply
acue                    delogo                  premultiply_dynamic
addroi                  denoise_vaapi           prewitt
adeclick                deshake                 prewitt_opencl
adeclip                 deshake_opencl          procamp_vaapi
adecorrelate            despill                 program_opencl
adelay                  detelecine              pseudocolor
adenorm                 dialoguenhance          psnr
aderivative             dilation                pullup
adrawgraph              dilation_opencl         qp
adrc                    displace                qrencode
adynamicequalizer       doubleweave             qrencodesrc
adynamicsmooth          drawbox                 quirc
aecho                   drawbox_vaapi           random
aemphasis               drawgraph               readeia608
aeval                   drawgrid                readvitc
aevalsrc                drawtext                realtime
aexciter                drawvg                  remap
afade                   drmeter                 remap_opencl
afdelaysrc              dynaudnorm              removegrain
afftdn                  earwax                  removelogo
afftfilt                ebur128                 repeatfields
afir                    edgedetect              replaygain
afireqsrc               elbg                    reverse
afirsrc                 entropy                 rgbashift
aformat                 epx                     rgbtestsrc
afreqshift              eq                      roberts
afwtdn                  equalizer               roberts_opencl
agate                   erosion                 rotate
agraphmonitor           erosion_opencl          rubberband
ahistogram              estdif                  sab
aiir                    exposure                scale
aintegral               extractplanes           scale2ref
ainterleave             extrastereo             scale_cuda
alatency                fade                    scale_d3d11
alimiter                feedback                scale_d3d12
allpass                 fftdnoiz                scale_qsv
allrgb                  fftfilt                 scale_vaapi
allyuv                  field                   scale_vulkan
aloop                   fieldhint               scdet
alphaextract            fieldmatch              scdet_vulkan
alphamerge              fieldorder              scharr
amerge                  fillborders             scroll
ametadata               find_rect               segment
amf_capture             firequalizer            select
amix                    flanger                 selectivecolor
amovie                  flip_vulkan             sendcmd
amplify                 flite                   separatefields
amultiply               floodfill               setdar
anequalizer             format                  setfield
anlmdn                  fps                     setparams
anlmf                   framepack               setpts
anlms                   framerate               setrange
anoisesrc               framestep               setsar
anull                   freezedetect            settb
anullsink               freezeframes            sharpness_vaapi
anullsrc                frei0r                  shear
apad                    frei0r_src              showcqt
aperms                  fspp                    showcwt
aphasemeter             fsync                   showfreqs
aphaser                 gblur                   showinfo
aphaseshift             gblur_vulkan            showpalette
apsnr                   geq                     showspatial
apsyclip                gfxcapture              showspectrum
apulsator               gradfun                 showspectrumpic
arealtime               gradients               showvolume
aresample               graphmonitor            showwaves
areverse                grayworld               showwavespic
arls                    greyedge                shuffleframes
arnndn                  guided                  shufflepixels
asdr                    haas                    shuffleplanes
asegment                haldclut                sidechaincompress
aselect                 haldclutsrc             sidechaingate
asendcmd                hdcd                    sidedata
asetnsamples            headphone               sierpinski
asetpts                 hflip                   signalstats
asetrate                hflip_vulkan            signature
asettb                  highpass                silencedetect
ashowinfo               highshelf               silenceremove
asidedata               hilbert                 sinc
asisdr                  histeq                  sine
asoftclip               histogram               siti
aspectralstats          hqdn3d                  smartblur
asplit                  hqx                     smptebars
ass                     hstack                  smptehdbars
astats                  hstack_qsv              sobel
astreamselect           hstack_vaapi            sobel_opencl
asubboost               hsvhold                 sofalizer
asubcut                 hsvkey                  spectrumsynth
asupercut               hue                     speechnorm
asuperpass              huesaturation           split
asuperstop              hwdownload              spp
atadenoise              hwmap                   sr_amf
atempo                  hwupload                ssim
atilt                   hwupload_cuda           ssim360
atrim                   hysteresis              stereo3d
avectorscope            iccdetect               stereotools
avgblur                 iccgen                  stereowiden
avgblur_opencl          identity                streamselect
avgblur_vulkan          idet                    subtitles
avsynctest              il                      super2xsai
axcorrelate             inflate                 superequalizer
azmq                    interlace               surround
backgroundkey           interlace_vulkan        swaprect
bandpass                interleave              swapuv
bandreject              join                    tblend
bass                    kerndeint               telecine
bbox                    kirsch                  testsrc
bench                   ladspa                  testsrc2
bilateral               lagfun                  thistogram
bilateral_cuda          latency                 threshold
biquad                  lenscorrection          thumbnail
bitplanenoise           lensfun                 thumbnail_cuda
blackdetect             libplacebo              tile
blackdetect_vulkan      libvmaf                 tiltandshift
blackframe              life                    tiltshelf
blend                   limitdiff               tinterlace
blend_vulkan            limiter                 tlut2
blockdetect             loop                    tmedian
blurdetect              loudnorm                tmidequalizer
bm3d                    lowpass                 tmix
boxblur                 lowshelf                tonemap
boxblur_opencl          lumakey                 tonemap_opencl
bs2b                    lut                     tonemap_vaapi
bwdif                   lut1d                   tpad
bwdif_cuda              lut2                    transpose
bwdif_vulkan            lut3d                   transpose_opencl
cas                     lutrgb                  transpose_vaapi
ccrepack                lutyuv                  transpose_vulkan
cellauto                mandelbrot              treble
channelmap              maskedclamp             tremolo
channelsplit            maskedmax               trim
chorus                  maskedmerge             unpremultiply
chromaber_vulkan        maskedmin               unsharp
chromahold              maskedthreshold         unsharp_opencl
chromakey               maskfun                 untile
chromakey_cuda          mcdeint                 uspp
chromanr                mcompand                v360
chromashift             median                  v360_vulkan
ciescope                mergeplanes             vaguedenoiser
codecview               mestimate               varblur
color                   mestimate_d3d12         vectorscope
color_vulkan            metadata                vflip
colorbalance            midequalizer            vflip_vulkan
colorchannelmixer       minterpolate            vfrdet
colorchart              mix                     vibrance
colorcontrast           monochrome              vibrato
colorcorrect            morpho                  vidstabdetect
colordetect             movie                   vidstabtransform
colorhold               mpdecimate              vif
colorize                mptestsrc               vignette
colorkey                msad                    virtualbass
colorkey_opencl         multiply                vmafmotion
colorlevels             negate                  volume
colormap                nlmeans                 volumedetect
colormatrix             nlmeans_opencl          vpp_amf
colorspace              nlmeans_vulkan          vpp_qsv
colorspace_cuda         nnedi                   vstack
colorspectrum           noformat                vstack_qsv
colortemperature        noise                   vstack_vaapi
compand                 normalize               w3fdif
compensationdelay       null                    waveform
concat                  nullsink                weave
convolution             nullsrc                 whisper
convolution_opencl      openclsrc               xbr
convolve                oscilloscope            xcorrelate
copy                    overlay                 xfade
corr                    overlay_cuda            xfade_opencl
cover_rect              overlay_opencl          xfade_vulkan
crop                    overlay_qsv             xmedian
cropdetect              overlay_vaapi           xpsnr
crossfeed               overlay_vulkan          xstack
crystalizer             owdenoise               xstack_qsv
cue                     pad                     xstack_vaapi
curves                  pad_cuda                yadif
datascope               pad_opencl              yadif_cuda
dblur                   pad_vaapi               yaepblur
dcshift                 pal100bars              yuvtestsrc
dctdnoiz                pal75bars               zmq
ddagrab                 palettegen              zoneplate
deband                  paletteuse              zoompan
deblock                 pan                     zscale

Enabled bsfs:
aac_adtstoasc           h264_metadata           pcm_rechunk
ahx_to_mp2              h264_mp4toannexb        pgs_frame_merge
apv_metadata            h264_redundant_pps      prores_metadata
av1_frame_merge         hapqa_extract           remove_extradata
av1_frame_split         hevc_metadata           setts
av1_metadata            hevc_mp4toannexb        showinfo
chomp                   imx_dump_header         smpte436m_to_eia608
dca_core                lcevc_metadata          text2movsub
dovi_rpu                media100_to_mjpegb      trace_headers
dts2pts                 mjpeg2jpeg              truehd_core
dump_extradata          mjpega_dump_header      vp9_metadata
dv_error_marker         mov2textsub             vp9_raw_reorder
eac3_core               mpeg2_metadata          vp9_superframe
eia608_to_smpte436m     mpeg4_unpack_bframes    vp9_superframe_split
evc_frame_merge         noise                   vvc_metadata
extract_extradata       null                    vvc_mp4toannexb
filter_units            opus_metadata

Enabled indevs:
dshow                   lavfi                   openal
gdigrab                 libcdio                 vfwcap

Enabled outdevs:
caca

git-full external libraries' versions: 

AMF v1.5.0-1-gd0b3e6d
aom v3.13.3-385-g12d3c0fff1
aribcaption 1.1.1
AviSynthPlus v3.7.5-281-g23f0e3fa
bs2b 3.1.0
cairo 1.18.5
chromaprint 1.6.0
codec2 1.2.0-108-g310777b1
dav1d 1.5.3-29-gaa45047
davs2 1.7-1-gb41cf11
dvdnav 7.0.0-1-gcf11277
dvdread 7.0.1-55-ge4d9a03
ffnvcodec n13.0.19.0-3-g33a9ede
flite v2.2-55-g6c9f20d
frei0r v3.1.2
gsm 1.0.24
ladspa-sdk 1.17
lame 3.100
lc3 1.1.3
lcms2 2.16
lensfun v0.3.95-1938-g43e6dec1
libcdio-paranoia 10.2
libgme 0.6.4
libilbc v3.0.4-346-g6adb26d4a4
libjxl v0.11-snapshot-560-g984782b8
libopencore-amrnb 0.1.6
libopencore-amrwb 0.1.6
libplacebo v7.360.0-14-g54e5275
libsoxr 0.1.3
libssh 0.12.0
libtheora v1.2.0
libwebp v1.6.0-168-g16b9c36
openal-soft latest
openapv v0.2.1.2-1-g4aad1d1
openmpt libopenmpt-0.6.28-8-g12fbcc46
opus v1.6.1-11-g788cc89c
qrencode 4.1.1
quirc 1.2
rav1e p20250624-3-g564ae3b
rist 0.2.12
rubberband v1.8.1
SDL release-2.32.0-179-g6587c12e1
shaderc v2026.1-7-g5ccedd3
shine 3.1.1
snappy 1.2.2
speex Speex-1.2.1-51-g0589522
srt v1.5.5-rc.2
SVT-AV1 v4.1.0-7-gb486d839
SVT-JPEG-XS v0.9.0-49-g318e847
twolame 0.4.0
uavs3d v1.1-50-g0e20d2c
VAAPI 2.24.0.
vidstab v1.1.1-24-g92bc0b0
vmaf v3.1.0-4-g42276bc5
vo-amrwbenc 0.1.3
vorbis v1.3.7-24-g68a7fc22
VPL 2.16
vpx v1.16.0-84-gb1f431c1e
vulkan-loader v1.4.349
vvenc v1.14.0-76-g4d463a0
whisper.cpp 1.8.4
x264 v0.165.3223
x265 4.1-242-gcfee9638c
xavs2 1.4
xevd 0.5.0
xeve 0.5.1
xvid v1.3.7
zeromq 4.3.5
zimg release-3.0.6-217-g5e8c322
zvbi v0.2.44-4-g41477c9

