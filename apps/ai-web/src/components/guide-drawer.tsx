"use client";

import { Bot, Coins, Globe, ImagePlus, Mic, Users } from "lucide-react";
import { Drawer } from "@/components/drawer";
import styles from "./guide-drawer.module.css";

type GuideDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const steps = [
  {
    icon: Bot,
    title: "普通对话",
    text: "点右上角「新对话」，选普通助手直接开聊。",
  },
  {
    icon: Users,
    title: "角色扮演",
    text: "进入角色库挑一个角色，或自己新建角色卡；剧情资料放进它的资料库。",
  },
  {
    icon: Globe,
    title: "多人群聊",
    text: "新对话里选「多人群聊」，拉 2–4 个角色同台，可配主持人、世界观和你扮演的角色。",
  },
  {
    icon: ImagePlus,
    title: "语音与图片",
    text: "点工作台「公益额度」卡片或聊天页顶栏的额度按钮，在「语音」「媒体」里填你自己的服务地址与 API Key，就能语音输入、朗读、看图、画图。",
  },
];

const modules = [
  {
    title: "角色扮演",
    items: [
      "角色库分预设与自定义：预设按燕中、科幻、历史阵营排列，自定义角色可随意编辑。",
      "角色详情里可以上传资料库：剧情、背景、经历，对话时只检索相关片段注入。",
      "对话满 15 条会自动整理角色的长期记忆，下次见面它还记得。",
      "角色卡支持 chara_card_v3 导入导出，可以从别的平台带角色进来。",
    ],
  },
  {
    title: "多人群聊",
    items: [
      "选 2–4 个角色同台，可选一位主持人只营造氛围、不发言。",
      "可以选一个世界观：燕川中学、星际航线，或点左侧「世界库」自己新建。",
      "填「你扮演的角色」后，你的发言会以那个身份出现在群里。",
      "新群聊会自动生成角色开场白，不用等谁先开口。",
    ],
  },
  {
    title: "语音与媒体",
    items: [
      "语音：点工作台「公益额度」卡片或聊天页顶栏的额度按钮，在「语音」里配置 ASR/TTS 服务，输入框有录音和朗读按钮，音色可调。",
      "图片：同样在「媒体」里配置视觉与画图模型，可以上传图片让角色看，也可以输入提示词生成图片。",
      "这些服务都支持 OpenAI 兼容接口，API Key 加密保存，不会回显。",
    ],
  },
  {
    title: "额度与数据",
    items: [
      "公益额度由管理员线下发放，工具抽屉里能看流水、管 API Key。",
      "「我的资料」是你自己的知识库，所有对话都会自动检索。",
      "会话可以导出、删除、归档；世界观和角色卡也可以带走。",
    ],
  },
];

export function GuideDrawer({ open, onClose }: GuideDrawerProps) {
  return (
    <Drawer open={open} title="使用指南" onClose={onClose}>
      <div className={styles.body}>
        <h2>快速开始</h2>
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.title}>
              <span className={styles.stepIcon}>
                <step.icon size={16} aria-hidden="true" />
              </span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.text}</small>
              </span>
            </li>
          ))}
        </ol>

        {modules.map((module) => (
          <section key={module.title}>
            <h2>{module.title}</h2>
            <ul className={styles.list}>
              {module.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2>小提示</h2>
          <ul className={styles.list}>
            <li>额度用完或登录过期会提示，重新登录即可继续。</li>
            <li>群聊里角色偶尔会说跑偏，系统会自动收起越界回复。</li>
            <li>功能还在暑期预览阶段，遇到问题欢迎反馈。</li>
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
