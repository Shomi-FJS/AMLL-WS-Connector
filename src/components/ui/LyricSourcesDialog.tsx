import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import DragHandleIcon from "@mui/icons-material/DragHandle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	List,
	ListItem,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import {
	type LyricSearchStatus,
	lyricSearchStatusAtom,
	lyricSourcesConfigAtom,
	rawLyricsContentAtom,
} from "@/store";
import { parseSourceString } from "@/utils/source";
import { RawLyricViewerDialog } from "./RawLyricViewerDialog";

export interface LyricSourcesDialogProps {
	open: boolean;
	onClose: () => void;
}

const STATUS_CONFIG: Record<
	LyricSearchStatus,
	{ text: string; color: string }
> = {
	idle: { text: "等待中", color: "text.secondary" },
	searching: { text: "正在搜索...", color: "info.main" },
	found: { text: "已找到", color: "success.main" },
	not_found: { text: "未找到", color: "text.secondary" },
	skipped: { text: "已跳过", color: "text.secondary" },
};

export function LyricSourcesDialog({ open, onClose }: LyricSourcesDialogProps) {
	const [sources, setSources] = useAtom(lyricSourcesConfigAtom);
	const [searchStatuses] = useAtom(lyricSearchStatusAtom);
	const rawLyricsContentMap = useAtomValue(rawLyricsContentAtom);
	const [newSourceStr, setNewSourceStr] = useState("");
	const [errorMsg, setErrorMsg] = useState("");
	const [viewerOpen, setViewerOpen] = useState(false);

	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropLineIndex, setDropLineIndex] = useState<number | null>(null);

	const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
	const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null);

	const handleToggle = (index: number) => {
		const newSources = [...sources];
		newSources[index].enabled = !newSources[index].enabled;
		setSources(newSources);
	};

	const handleDelete = (index: number) => {
		const newSources = [...sources];
		newSources.splice(index, 1);
		setSources(newSources);
	};

	const handleAddSource = () => {
		if (!newSourceStr.trim()) return;
		try {
			const parsedSource = parseSourceString(newSourceStr);

			if (sources.some((s) => s.source.id === parsedSource.id)) {
				setErrorMsg("该歌词源已存在，请勿重复添加！");
				return;
			}

			setSources([...sources, { enabled: true, source: parsedSource }]);
			setNewSourceStr("");
			setErrorMsg("");
		} catch (e) {
			console.error("解析歌词源失败", e);
			setErrorMsg("解析失败，请检查歌词源字符串格式是否正确");
		}
	};

	const handleViewRawLyric = () => {
		setViewerOpen(true);
		handleMenuClose();
	};

	const targetSource =
		activeMenuIndex !== null ? sources[activeMenuIndex] : null;
	const targetRawLyric = targetSource
		? rawLyricsContentMap[targetSource.source.id]
		: null;

	const handleDragStart = (
		e: React.DragEvent<HTMLLIElement>,
		index: number,
	) => {
		setDragIndex(index);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", index.toString());
	};

	const handleDragOver = (e: React.DragEvent<HTMLLIElement>, index: number) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";

		const rect = e.currentTarget.getBoundingClientRect();
		const middleY = rect.top + rect.height / 2;

		const targetGap = e.clientY < middleY ? index : index + 1;

		if (targetGap !== dropLineIndex) {
			setDropLineIndex(targetGap);
		}
	};

	const handleDrop = (e: React.DragEvent<HTMLLIElement>) => {
		e.preventDefault();
		if (dragIndex === null || dropLineIndex === null) {
			handleDragEnd();
			return;
		}

		if (dropLineIndex === dragIndex || dropLineIndex === dragIndex + 1) {
			handleDragEnd();
			return;
		}

		const newSources = [...sources];
		const draggedItem = newSources[dragIndex];

		newSources.splice(dragIndex, 1);

		const insertIndex =
			dropLineIndex > dragIndex ? dropLineIndex - 1 : dropLineIndex;

		newSources.splice(insertIndex, 0, draggedItem);

		setSources(newSources);
		handleDragEnd();
	};

	const handleDragEnd = () => {
		setDragIndex(null);
		setDropLineIndex(null);
	};

	const handleMenuOpen = (
		event: React.MouseEvent<HTMLElement>,
		index: number,
	) => {
		setMenuAnchorEl(event.currentTarget);
		setActiveMenuIndex(index);
	};

	const handleMenuClose = () => {
		setMenuAnchorEl(null);
	};

	const handleMoveUp = () => {
		if (activeMenuIndex === null || activeMenuIndex <= 0) return;
		const newSources = [...sources];
		const temp = newSources[activeMenuIndex];
		newSources[activeMenuIndex] = newSources[activeMenuIndex - 1];
		newSources[activeMenuIndex - 1] = temp;
		setSources(newSources);
		handleMenuClose();
	};

	const handleMoveDown = () => {
		if (activeMenuIndex === null || activeMenuIndex >= sources.length - 1)
			return;
		const newSources = [...sources];
		const temp = newSources[activeMenuIndex];
		newSources[activeMenuIndex] = newSources[activeMenuIndex + 1];
		newSources[activeMenuIndex + 1] = temp;
		setSources(newSources);
		handleMenuClose();
	};

	const handleDeleteFromMenu = () => {
		if (activeMenuIndex !== null) {
			handleDelete(activeMenuIndex);
		}
		handleMenuClose();
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
			<DialogTitle sx={{ fontWeight: "bold" }}>歌词源设置</DialogTitle>
			<DialogContent dividers>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					越靠前的歌词源优先级越高，会获取全部源的歌词然后显示最高优先级的歌词
				</Typography>

				<List
					sx={{
						borderRadius: 1,
						border: "1px solid",
						borderColor: "divider",
						overflow: "hidden",
					}}
				>
					{sources.map((item, index) => {
						const status = searchStatuses[item.source.id] || "idle";
						const statusInfo = STATUS_CONFIG[status];

						const showTopLine = dropLineIndex === index;
						const showBottomLine =
							index === sources.length - 1 && dropLineIndex === sources.length;
						const showLine = showTopLine || showBottomLine;

						return (
							<ListItem
								key={item.source.id}
								divider={index !== sources.length - 1}
								draggable
								onDragStart={(e) => handleDragStart(e, index)}
								onDragEnter={(e) => e.preventDefault()}
								onDragOver={(e) => handleDragOver(e, index)}
								onDrop={handleDrop}
								onDragEnd={handleDragEnd}
								sx={{
									pr: 14,
									pl: 1,
									py: 1.5,
									cursor: "grab",
									position: "relative",

									"& > *": {
										opacity: dragIndex === index ? 0.4 : 1,
										transition: "opacity 0.2s ease",
									},

									"&::before": showLine
										? {
												content: '""',
												position: "absolute",
												left: 0,
												right: 0,
												height: "2px",
												bgcolor: "primary.main",
												zIndex: 1,
												[showBottomLine ? "bottom" : "top"]: 0,
											}
										: {},
								}}
							>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										color: "text.disabled",
										ml: 0.5,
										mr: 2,
									}}
								>
									<DragHandleIcon />
								</Box>

								<ListItemText
									primary={
										<Typography
											variant="subtitle2"
											sx={{
												fontWeight: item.enabled ? "bold" : "normal",
												color: item.enabled ? "text.primary" : "text.disabled",
											}}
										>
											{item.source.name || "未命名歌词源"}
										</Typography>
									}
									secondary={
										<Box
											sx={{
												display: "flex",
												flexDirection: "column",
												mt: 0.5,
												gap: 0.5,
											}}
										>
											{item.source.desc && (
												<Typography
													variant="caption"
													color="text.secondary"
													noWrap
												>
													{item.source.desc}
												</Typography>
											)}

											<Box
												sx={{ display: "flex", alignItems: "center", gap: 1 }}
											>
												<Typography
													variant="caption"
													sx={{
														color: item.enabled
															? statusInfo.color
															: "text.disabled",
														display: "flex",
														alignItems: "center",
														gap: 0.5,
														fontWeight: status === "found" ? "bold" : "normal",
													}}
												>
													{item.enabled && status === "searching" && (
														<CircularProgress
															size={10}
															color="inherit"
															thickness={5}
														/>
													)}
													{item.enabled ? statusInfo.text : "已禁用"}
												</Typography>
											</Box>
										</Box>
									}
								/>

								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										position: "absolute",
										right: 8,
										gap: 0.5,
									}}
								>
									<Switch
										size="small"
										checked={item.enabled}
										onChange={() => handleToggle(index)}
										color="primary"
									/>
									<IconButton
										size="small"
										onClick={(e) => handleMenuOpen(e, index)}
									>
										<MoreVertIcon fontSize="small" />
									</IconButton>
								</Box>
							</ListItem>
						);
					})}
				</List>

				<Menu
					anchorEl={menuAnchorEl}
					open={Boolean(menuAnchorEl)}
					onClose={handleMenuClose}
					anchorOrigin={{
						vertical: "bottom",
						horizontal: "right",
					}}
					transformOrigin={{
						vertical: "top",
						horizontal: "right",
					}}
				>
					<MenuItem onClick={handleViewRawLyric} disabled={!targetRawLyric}>
						<ListItemIcon>
							<VisibilityIcon
								fontSize="small"
								color={!targetRawLyric ? "disabled" : "inherit"}
							/>
						</ListItemIcon>
						<ListItemText>查看原始歌词</ListItemText>
					</MenuItem>

					<MenuItem
						onClick={handleMoveUp}
						disabled={activeMenuIndex === 0 || activeMenuIndex === null}
					>
						<ListItemIcon>
							<ArrowUpwardIcon fontSize="small" />
						</ListItemIcon>
						<ListItemText>上移</ListItemText>
					</MenuItem>
					<MenuItem
						onClick={handleMoveDown}
						disabled={
							activeMenuIndex === null || activeMenuIndex === sources.length - 1
						}
					>
						<ListItemIcon>
							<ArrowDownwardIcon fontSize="small" />
						</ListItemIcon>
						<ListItemText>下移</ListItemText>
					</MenuItem>

					{activeMenuIndex !== null &&
						(() => {
							const targetSource = sources[activeMenuIndex];
							const isBuiltin =
								targetSource?.source.type.startsWith("builtin") ?? false;

							const deleteMenuItem = (
								<MenuItem
									onClick={handleDeleteFromMenu}
									disabled={isBuiltin}
									sx={{ color: isBuiltin ? "text.disabled" : "error.main" }}
								>
									<ListItemIcon>
										<DeleteIcon
											fontSize="small"
											color={isBuiltin ? "disabled" : "error"}
										/>
									</ListItemIcon>
									<ListItemText>删除</ListItemText>
								</MenuItem>
							);

							return isBuiltin ? (
								<Tooltip title="不能删除内置源" placement="left">
									<span>{deleteMenuItem}</span>
								</Tooltip>
							) : (
								deleteMenuItem
							);
						})()}
				</Menu>

				<Box sx={{ mt: 4 }}>
					<Typography variant="subtitle2" sx={{ mb: 1 }}>
						添加外部歌词源
					</Typography>
					<Box sx={{ display: "flex", gap: 1 }}>
						<TextField
							size="small"
							fullWidth
							placeholder="id|name|desc|type|url"
							value={newSourceStr}
							onChange={(e) => setNewSourceStr(e.target.value)}
							error={!!errorMsg}
						/>
						<Button
							variant="contained"
							disableElevation
							onClick={handleAddSource}
						>
							添加
						</Button>
					</Box>
					{errorMsg && (
						<Alert severity="warning" sx={{ mt: 1, py: 0 }}>
							{errorMsg}
						</Alert>
					)}
				</Box>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} color="inherit">
					完成
				</Button>
			</DialogActions>

			{targetSource && (
				<RawLyricViewerDialog
					open={viewerOpen}
					onClose={() => setViewerOpen(false)}
					content={targetRawLyric}
				/>
			)}
		</Dialog>
	);
}
