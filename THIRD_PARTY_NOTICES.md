# 第三方软件许可清单

本仓库不包含 LiteLLM、Open WebUI 或 PostgreSQL 的源码副本，但 Docker Compose 会拉取并运行固定摘要的第三方镜像。第三方代码版权继续归各权利人所有，燕中生态不将其声明为自主代码。

## 固定版本与来源

| 组件 | 固定构建 | 源码 revision | 许可与运行边界 |
| --- | --- | --- | --- |
| LiteLLM Database | `sha256:64d3547e0b131bf4638342e52c12bc46d6f1d9b8498e4b731ff31be5ab316ea9` | `BerriAI/litellm@b3086ccd74553565c9a39716e72303ae985555f9`，1.92.0 stable cut | 仓库 `enterprise/` 外为 MIT；发布前仍须确认所用镜像未启用企业专有内容 |
| Open WebUI | `v0.10.2@sha256:9fcea9c6e32ab60b0498f3986c6cdf651ddbe61db48d2213a3d28048ddd673d4` | `open-webui/open-webui@ecd48e2f718220a6400ecf49eafd4867a38feb10` | Open WebUI License；品牌修改仅在滚动 30 日直接用户不超过 50 人、取得书面许可或取得企业许可时允许 |
| PostgreSQL | `16.14-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777` | PostgreSQL 16.14 | PostgreSQL License；Docker 官方镜像包装脚本为 MIT |

任何镜像升级必须同时更新摘要、源码 revision、许可证文本和验收记录。无法定位源码 revision 或许可证的镜像不得进入生产。

## Open WebUI License

Open WebUI License

Copyright (c) 2023- Open WebUI Inc. [Created by Timothy Jaeryang Baek]
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

4. Notwithstanding any other provision of this License, and as a material
   condition of the rights granted herein, licensees are strictly prohibited
   from altering, removing, obscuring, or replacing any "Open WebUI"
   branding, including but not limited to the name, logo, or any visual,
   textual, or symbolic identifiers that distinguish the software and its
   interfaces, in any deployment or distribution, except in the following
   circumstances: (i) deployments or distributions where the total number
   of end users (defined as individual natural persons with direct access
   to the application) does not exceed fifty (50) within any rolling
   thirty (30) day period; (ii) the licensee has obtained specific prior
   written permission from the copyright holder; or (iii) where the
   licensee has obtained a duly executed enterprise license expressly
   permitting such modification. For all other cases, any removal or
   alteration of the "Open WebUI" branding shall constitute a material
   breach of license.

Materials governed by prior licenses retain those original license
terms, as specified in LICENSE_HISTORY.

By contributing to this project, you agree to the project's Contributor
License Agreement (CONTRIBUTOR_LICENSE_AGREEMENT).

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## LiteLLM License

Portions of this software are licensed as follows:

* All content that resides under the `enterprise/` directory of the LiteLLM repository, if that directory exists, is licensed under the license defined in `enterprise/LICENSE`.
* Content outside that directory or restriction is available under the MIT License below.

MIT License

Copyright (c) 2023 Berri AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## PostgreSQL License

PostgreSQL Database Management System
(also known as Postgres, formerly known as Postgres95)

Portions Copyright (c) 1996-2026, PostgreSQL Global Development Group

Portions Copyright (c) 1994, The Regents of the University of California

Permission to use, copy, modify, and distribute this software and its
documentation for any purpose, without fee, and without a written agreement
is hereby granted, provided that the above copyright notice and this paragraph
and the following two paragraphs appear in all copies.

IN NO EVENT SHALL THE UNIVERSITY OF CALIFORNIA BE LIABLE TO ANY PARTY FOR
DIRECT, INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING
LOST PROFITS, ARISING OUT OF THE USE OF THIS SOFTWARE AND ITS
DOCUMENTATION, EVEN IF THE UNIVERSITY OF CALIFORNIA HAS BEEN ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

THE UNIVERSITY OF CALIFORNIA SPECIFICALLY DISCLAIMS ANY WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS FOR A PARTICULAR PURPOSE. THE SOFTWARE PROVIDED HEREUNDER IS ON
AN "AS IS" BASIS, AND THE UNIVERSITY OF CALIFORNIA HAS NO OBLIGATIONS TO
PROVIDE MAINTENANCE, SUPPORT, UPDATES, ENHANCEMENTS, OR MODIFICATIONS.

## Docker PostgreSQL image packaging

Copyright (c) 2014, Docker PostgreSQL Authors (See upstream AUTHORS)

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
